#!/usr/bin/env tsx
/**
 * Brewing Research Worker Agent
 * ─────────────────────────────────────────────────────────────────────────────
 * A self-running agent that operates indefinitely without human intervention:
 *
 *   1. Polls Brewing every 10 s for open jobs tagged [cap:research]
 *   2. Accepts each matching job on-chain
 *   3. Calls Claude claude-opus-4-7 (adaptive thinking) with the job prompt
 *   4. Submits the AI response as work output on-chain
 *   5. Waits for payment confirmation (USDC released by the poster daemon)
 *
 * Multiple jobs run concurrently — the poll loop never blocks on a single job.
 *
 * ── Setup ────────────────────────────────────────────────────────────────────
 *   cp .env.example .env
 *   # set WORKER_SECRET_KEY and ANTHROPIC_API_KEY
 *   npm run worker
 *
 * Pair with `npm run poster` (poster-daemon.ts) for a fully autonomous economy.
 * Post research jobs with `npm run post-job`.
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { BrewingClient, DEVNET_USDC_MINT, type Job } from "../sdk/src/index";

// ── Config ────────────────────────────────────────────────────────────────────
const CAPABILITY       = "research";
const POLL_INTERVAL_MS = 10_000;          // how often to scan for new jobs
const PAYMENT_WAIT_MS  = 10 * 60_000;    // max time to wait for payment (10 min)
const PAYMENT_POLL_MS  = 8_000;          // how often to check for payment
const RPC_URL          = "https://api.devnet.solana.com";
const USDC_MINT        = new PublicKey(DEVNET_USDC_MINT);
const EXPLORER_TX      = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// ── Validate environment ──────────────────────────────────────────────────────
if (!process.env.WORKER_SECRET_KEY) {
  console.error("❌  WORKER_SECRET_KEY not set. See demo/.env.example");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌  ANTHROPIC_API_KEY not set. See demo/.env.example");
  process.exit(1);
}

// ── Parse worker keypair ──────────────────────────────────────────────────────
let workerKeypair: Keypair;
try {
  workerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.WORKER_SECRET_KEY) as number[])
  );
} catch {
  console.error("❌  WORKER_SECRET_KEY must be a JSON byte-array (e.g. [1,2,3,...,64]).");
  console.error("    Generate one with: solana-keygen new --outfile worker.json");
  process.exit(1);
}

// ── Logger ────────────────────────────────────────────────────────────────────
const ts  = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (msg: string) => console.log(`[${ts()}]  ${msg}`);
const err = (msg: string) => console.error(`[${ts()}]  ❌ ${msg}`);

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const conn      = new Connection(RPC_URL, "confirmed");
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const client    = new BrewingClient({ connection: conn, wallet: workerKeypair });

  // ── Banner ─────────────────────────────────────────────────────────────────
  console.log();
  console.log("╔═════════════════════════════════════════════════════════════╗");
  console.log("║        BREWING RESEARCH WORKER AGENT  —  Starting          ║");
  console.log("╚═════════════════════════════════════════════════════════════╝");
  console.log();
  log(`Capability    : ${CAPABILITY}`);
  log(`Wallet        : ${workerKeypair.publicKey.toBase58()}`);
  log(`Poll interval : every ${POLL_INTERVAL_MS / 1000}s`);
  console.log();

  // ── Ensure SOL for transaction fees ───────────────────────────────────────
  const lamports = await conn.getBalance(workerKeypair.publicKey);
  if (lamports < 0.05 * LAMPORTS_PER_SOL) {
    log("Balance low — requesting 1 SOL devnet airdrop…");
    const ok = await requestAirdropWithRetry(workerKeypair.publicKey, conn);
    if (!ok) {
      log("⚠️  Auto-airdrop failed. Fund manually:");
      log("    https://faucet.solana.com  →  paste worker address  →  Devnet");
      log(`    Address: ${workerKeypair.publicKey.toBase58()}`);
      log("   (agent will continue — fund the wallet then it will process jobs)");
    }
  } else {
    log(`SOL balance : ${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  }

  // ── Create USDC token account (required to receive payment) ───────────────
  // Retry until SOL is available — covers the case where the airdrop failed
  // and the user needs to fund manually via faucet.solana.com
  log("Ensuring USDC token account exists…");
  let workerAtaInfo: Awaited<ReturnType<typeof getOrCreateAssociatedTokenAccount>> | null = null;
  while (!workerAtaInfo) {
    const bal = await conn.getBalance(workerKeypair.publicKey);
    if (bal < 5_000) {
      log("⏳  Waiting for SOL — fund at https://faucet.solana.com");
      log(`    Worker address: ${workerKeypair.publicKey.toBase58()}`);
      await sleep(8_000);
      continue;
    }
    try {
      workerAtaInfo = await getOrCreateAssociatedTokenAccount(
        conn,
        workerKeypair,
        USDC_MINT,
        workerKeypair.publicKey
      );
    } catch (e) {
      err(`USDC ATA creation failed: ${(e as Error).message} — retrying in 8 s…`);
      await sleep(8_000);
    }
  }
  log(`USDC ATA      : ${workerAtaInfo.address.toBase58()}`);
  const startingUsdc = Number(workerAtaInfo.amount) / 1_000_000;
  log(`USDC balance  : ${startingUsdc.toFixed(6)} USDC`);
  console.log();
  log(`Scanning for [cap:${CAPABILITY}] jobs every ${POLL_INTERVAL_MS / 1000}s…`);
  log("Press Ctrl+C to stop.\n");

  // ── Track jobs to prevent concurrent double-processing ────────────────────
  const processing = new Set<number>();

  // ── Poll loop ──────────────────────────────────────────────────────────────
  while (true) {
    try {
      const openJobs = await client.getOpenJobs(CAPABILITY);
      const newJobs  = openJobs.filter((j) => !processing.has(j.jobId));

      if (newJobs.length === 0) {
        log(`No new [cap:${CAPABILITY}] jobs found.`);
      } else {
        log(`Found ${newJobs.length} new [cap:${CAPABILITY}] job(s).`);
        for (const job of newJobs) {
          // Lock the slot immediately — before any awaits — to prevent the
          // next poll iteration from picking up the same job.
          processing.add(job.jobId);

          // Fire-and-forget: jobs run concurrently in the background so the
          // poll loop stays on schedule regardless of job duration.
          handleJob(job, client, anthropic, conn, workerAtaInfo.address).catch(
            (e: Error) => {
              const isBillingError =
                e.message.includes("credit balance is too low") ||
                e.message.includes("invalid_api_key") ||
                e.message.includes("authentication_error");

              if (isBillingError) {
                err(`─────────────────────────────────────────────────────────`);
                err(`ANTHROPIC API BILLING ERROR — worker paused.`);
                err(`Add credits at https://console.anthropic.com/settings/billing`);
                err(`Then recover stuck job with:  npm run recover -- ${job.jobId}`);
                err(`─────────────────────────────────────────────────────────`);
                // Keep the job locked — don't retry; it's stuck InProgress on-chain
              } else {
                err(`Job #${job.jobId} handler crashed: ${e.message}`);
                // Release the slot so the job can be retried next poll
                processing.delete(job.jobId);
              }
            }
          );
        }
      }
    } catch (e) {
      err(`Poll error: ${(e as Error).message}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

// ── Job handler ───────────────────────────────────────────────────────────────
async function handleJob(
  job: Job,
  client: BrewingClient,
  anthropic: Anthropic,
  conn: Connection,
  workerAtaAddress: PublicKey
): Promise<void> {
  const { jobId, task, paymentAmount } = job;
  const prefix = `[#${jobId}]`;

  log(`${"─".repeat(63)}`);
  log(`${prefix}  NEW JOB  ${paymentAmount.toFixed(2)} USDC`);
  log(`${prefix}  Task: "${task.slice(0, 80)}${task.length > 80 ? "…" : ""}"`);

  // ── Step 1: Accept the job on-chain ────────────────────────────────────────
  log(`${prefix}  Accepting…`);
  const { txSig: acceptTx } = await client.acceptJob(jobId);
  log(`${prefix}  ✅ Accepted — ${EXPLORER_TX(acceptTx)}`);

  // ── Step 2: Call Claude claude-opus-4-7 with the job task ──────────────────────
  log(`${prefix}  Calling Claude claude-opus-4-7 (adaptive thinking)…`);

  let workOutput = "";
  const stream = anthropic.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thinking: { type: "adaptive" } as any,
    system: [
      "You are a professional research agent operating autonomously inside a",
      "decentralised AI job marketplace. Deliver thorough, accurate, well-structured",
      "responses. Be concise yet complete. No preamble — go straight to the substance.",
    ].join(" "),
    messages: [{ role: "user", content: task }],
  });

  stream.on("text", (chunk) => { workOutput += chunk; });
  await stream.finalMessage();
  log(`${prefix}  ✅ AI response: ${workOutput.length} chars`);

  // ── Step 3: Submit work on-chain ───────────────────────────────────────────
  log(`${prefix}  Submitting work on-chain…`);
  const { completeTxSig, autoReleased, releaseTxSig } =
    await client.submitWork(jobId, workOutput);
  log(`${prefix}  ✅ Work submitted — ${EXPLORER_TX(completeTxSig)}`);

  if (autoReleased && releaseTxSig) {
    // Poster and worker are the same wallet — payment released instantly
    log(`${prefix}  ✅ Auto-released — ${EXPLORER_TX(releaseTxSig)}`);
    await logPaymentReceived(jobId, conn, workerAtaAddress, paymentAmount);
    return;
  }

  // ── Step 4: Wait for poster to release payment ─────────────────────────────
  log(`${prefix}  Status: PendingRelease — waiting for poster to approve…`);
  const paid = await waitForPayment(
    jobId,
    client,
    conn,
    workerAtaAddress,
    PAYMENT_WAIT_MS,
    PAYMENT_POLL_MS
  );

  if (paid) {
    await logPaymentReceived(jobId, conn, workerAtaAddress, paymentAmount);
  } else {
    log(`${prefix}  ⚠️  Timed out waiting for payment after ${PAYMENT_WAIT_MS / 60_000} min.`);
    log(`${prefix}     The poster may release it later — check your USDC balance.`);
  }
}

// ── Wait for job → Completed, then confirm USDC arrived ───────────────────────
async function waitForPayment(
  jobId: number,
  client: BrewingClient,
  conn: Connection,
  workerAtaAddress: PublicKey,
  timeoutMs: number,
  pollMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollMs);
    try {
      const job = await client.getJob(jobId);
      if (job?.status === "Completed") return true;
    } catch {
      // Transient RPC error — keep waiting
    }
  }
  return false;
}

async function logPaymentReceived(
  jobId: number,
  conn: Connection,
  workerAtaAddress: PublicKey,
  expectedUsdc: number
): Promise<void> {
  try {
    const acct      = await getAccount(conn, workerAtaAddress);
    const balance   = Number(acct.amount) / 1_000_000;
    log(
      `[#${jobId}]  💰 PAYMENT RECEIVED  +${expectedUsdc.toFixed(2)} USDC` +
      `  (new balance: ${balance.toFixed(6)} USDC)`
    );
  } catch {
    log(`[#${jobId}]  💰 PAYMENT RECEIVED  +${expectedUsdc.toFixed(2)} USDC`);
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry airdrop across two RPC endpoints — devnet faucet is often flaky
async function requestAirdropWithRetry(
  pubkey: PublicKey,
  primaryConn: Connection,
  attempts = 3
): Promise<boolean> {
  const endpoints = [
    RPC_URL,
    "https://rpc.ankr.com/solana_devnet",
  ];
  for (let i = 0; i < attempts; i++) {
    const endpoint = endpoints[i % endpoints.length];
    try {
      const c = endpoint === RPC_URL ? primaryConn : new Connection(endpoint, "confirmed");
      const sig = await c.requestAirdrop(pubkey, LAMPORTS_PER_SOL);
      await c.confirmTransaction(sig, "confirmed");
      log("✅  SOL airdrop confirmed.");
      return true;
    } catch {
      if (i < attempts - 1) {
        log(`   Attempt ${i + 1} failed — retrying in 3 s…`);
        await sleep(3_000);
      }
    }
  }
  return false;
}

// ── Start ─────────────────────────────────────────────────────────────────────
main().catch((e: Error) => {
  console.error(`\n💥  Worker crashed: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
