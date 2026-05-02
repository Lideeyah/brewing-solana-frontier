/**
 * Brewing Analytics API  —  GET /api/analytics
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads every JobAccount directly from the Solana JSON-RPC, decodes the raw
 * borsh data without Anchor, and returns traction metrics as JSON.
 *
 * No external dependencies beyond built-in Node.js Buffer + fetch.
 * Response is cached at the Vercel edge for 30 s (stale-while-revalidate 60 s).
 *
 * Live endpoint: https://brewing-three.vercel.app/api/analytics
 *
 * Example response:
 * {
 *   "program":   "BsFiGxfJ9Spn5kp6bJoCxAwswKRskpTiPodNt8EA6QdM",
 *   "network":   "devnet",
 *   "explorer":  "https://explorer.solana.com/address/BsF...?cluster=devnet",
 *   "updatedAt": "2026-04-25T11:00:00.000Z",
 *   "metrics": {
 *     "totalJobs":      142,
 *     "completedJobs":  118,
 *     "completionRate": 83.1,
 *     "usdcSettled":    11.8,
 *     "uniqueAgents":   7
 *   }
 * }
 */

const PROGRAM_ID = 'BsFiGxfJ9Spn5kp6bJoCxAwswKRskpTiPodNt8EA6QdM';
const RPC_URL    = process.env.RPC_URL ?? 'https://devnet.helius-rpc.com/?api-key=a061166a-9840-4130-9319-39a8efd7b0cf';
const EXPLORER   = `https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`;

// ── JobAccount discriminator from the IDL ──────────────────────────────────
// sha256("account:JobAccount")[0..8] = [91, 16, 162, 5, 45, 210, 125, 65]
const DISCRIMINATOR = Buffer.from([91, 16, 162, 5, 45, 210, 125, 65]);

// JobStatus enum index (Open=0, InProgress=1, PendingRelease=2, Completed=3)
const STATUS_COMPLETED = 3;

// ── Borsh layout of JobAccount (after 8-byte discriminator) ──────────────────
//   [0 ..  8)  job_id         u64 LE
//   [8 .. 12)  description.len u32 LE
//   [12 .. 12+N)  description   bytes
//   [N  .. N+8)  payment_amount u64 LE       ← N = 12 + descLen
//   [N+8 .. N+40) poster_agent  pubkey (32 B)
//   [N+40.. N+72) worker_agent  pubkey (32 B) — all-zeros when unassigned
//   [N+72]         status        u8 (enum variant index)
function parseJob(base64: string): {
  paymentUsdc: number;
  status: number;
  posterHex: string;
  workerHex: string;
} | null {
  try {
    const buf = Buffer.from(base64, 'base64');

    // Must start with the correct 8-byte discriminator
    if (buf.length < 9 || !buf.subarray(0, 8).equals(DISCRIMINATOR)) return null;

    let off = 8;                                              // skip discriminator
    off += 8;                                                 // skip job_id (u64)

    const descLen = buf.readUInt32LE(off); off += 4;          // description length
    off += descLen;                                           // skip description bytes

    // payment_amount (u64 LE) — split into two u32s to stay in JS safe-integer range
    const lo = buf.readUInt32LE(off);
    const hi = buf.readUInt32LE(off + 4);
    const paymentUsdc = (lo + hi * 0x1_0000_0000) / 1_000_000;
    off += 8;

    const posterHex = buf.subarray(off, off + 32).toString('hex');
    off += 32;

    const workerBytes = buf.subarray(off, off + 32);
    const workerHex   = workerBytes.every(b => b === 0) ? '' : workerBytes.toString('hex');
    off += 32;

    const status = buf[off]; // u8 enum variant

    return { paymentUsdc, status, posterHex, workerHex };
  } catch {
    return null; // malformed / wrong account type — skip
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(_req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  try {
    // ── Fetch all accounts owned by the Brewing program ─────────────────────
    const rpcResp = await fetch(RPC_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id:      1,
        method:  'getProgramAccounts',
        params:  [PROGRAM_ID, { encoding: 'base64' }],
      }),
    });

    const { result, error } = await rpcResp.json() as {
      result: Array<{ account: { data: [string, string] } }> | null;
      error?: { message: string };
    };

    if (error) throw new Error(error.message);
    if (!result) throw new Error('Empty RPC response');

    // ── Parse and aggregate ─────────────────────────────────────────────────
    const wallets     = new Set<string>();
    let totalJobs     = 0;
    let completedJobs = 0;
    let usdcSettled   = 0;

    for (const { account } of result) {
      const job = parseJob(account.data[0]);
      if (!job) continue; // not a JobAccount (e.g. escrow token account) — skip

      totalJobs++;
      wallets.add(job.posterHex);
      if (job.workerHex) wallets.add(job.workerHex);

      if (job.status === STATUS_COMPLETED) {
        completedJobs++;
        usdcSettled += job.paymentUsdc;
      }
    }

    const completionRate = totalJobs > 0
      ? +((completedJobs / totalJobs) * 100).toFixed(1)
      : 0;

    return res.status(200).json({
      program:   PROGRAM_ID,
      network:   'devnet',
      explorer:  EXPLORER,
      updatedAt: new Date().toISOString(),
      metrics: {
        totalJobs,
        completedJobs,
        completionRate,
        usdcSettled:  +usdcSettled.toFixed(4),
        uniqueAgents: wallets.size,
      },
    });

  } catch (err) {
    console.error('[analytics]', err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
