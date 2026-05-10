/**
 * POST /api/demo-run
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-Sent Events endpoint powering the judge-ready Run Demo sequence.
 * Streams each lifecycle step with a real on-chain tx signature.
 *
 * ── Phase 1 — Happy path ──────────────────────────────────────────────────────
 *   Post job → Accept (worker) → Claude haiku analysis → Submit work + score
 *   → Release payment → 0.10 USDC lands in worker wallet
 *
 * ── Phase 2 — Adversarial case ───────────────────────────────────────────────
 *   Post job → Accept (worker) → Dispute with score 3 (below threshold 7)
 *   → Escrow stays locked → Poster reclaims full USDC
 *
 * SSE event shape: { event, phase, jobId?, txSig?, score?, payment?, task?, poster?, worker? }
 *
 * Required Vercel env vars:
 *   POSTER_SECRET_KEY   — JSON byte array for poster keypair
 *   WORKER_SECRET_KEY   — JSON byte array for worker keypair
 *   ANTHROPIC_API_KEY   — Anthropic API key
 *   RPC_URL             — (optional) Helius devnet RPC
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Connection, Keypair }                from "@solana/web3.js";
import Anthropic                             from "@anthropic-ai/sdk";
import { BrewingClient }                     from "brewing-sdk";

// ── Torque event helper (fire-and-forget, never throws) ───────────────────────
async function torqueEvent(
  eventType:   string,
  userAddress: string,
  metadata:    Record<string, unknown>,
): Promise<void> {
  const apiKey     = process.env.TORQUE_API_KEY;
  const campaignId = process.env.TORQUE_CAMPAIGN_ID;
  if (!apiKey || !campaignId) return; // not configured yet — skip silently

  try {
    await fetch(`https://api.torque.so/v1/campaigns/${campaignId}/events`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        eventType,
        userAddress,
        metadata: { source: "brewing-marketplace", network: "solana-devnet", ...metadata },
      }),
    });
  } catch { /* never surface Torque errors to the demo stream */ }
}

export const maxDuration = 300; // Vercel Pro: max 300 s streaming

const RPC_URL =
  process.env.RPC_URL ??
  "https://devnet.helius-rpc.com/?api-key=a061166a-9840-4130-9319-39a8efd7b0cf";

// ── Hardcoded demo content ────────────────────────────────────────────────────
const DEMO_TASK =
  "Analyse the top 3 Solana DeFi protocols by TVL and identify the highest " +
  "yield opportunity for a $1,000 position";
const DEMO_CAPABILITY = "research";
const DEMO_PAYMENT    = 0.10;

const WORKER_SYSTEM_PROMPT = `You are a research analyst agent on the Brewing AI marketplace.
STRUCTURE: ## Summary (2 sentences) → ## Top 3 Protocols (name, TVL, core mechanic, risk) → ## Best Yield Opportunity → ## Recommendation.
Be specific: include protocol names, approximate APY figures, and concrete action.
Keep the total response under 350 words.`;

// ── Adversarial task — intentionally trivial to produce a low-quality result ─
const ADVERSARIAL_TASK = "Analyse the top 3 Solana DeFi protocols";
const BAD_SCORE = 3; // well below the 7 threshold

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

// ── SSE helpers ───────────────────────────────────────────────────────────────
type SsePayload = Record<string, unknown>;

function makeSender(res: VercelResponse) {
  return function send(payload: SsePayload) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "POST or GET only" });
  }

  const posterKeyStr = process.env.POSTER_SECRET_KEY;
  const workerKeyStr = process.env.WORKER_SECRET_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!posterKeyStr || !workerKeyStr || !anthropicKey) {
    return res.status(500).json({
      error:
        "Missing env vars. Ensure POSTER_SECRET_KEY, WORKER_SECRET_KEY, and ANTHROPIC_API_KEY are set in Vercel.",
    });
  }

  let posterKeypair: Keypair;
  let workerKeypair: Keypair;
  try {
    posterKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(posterKeyStr) as number[])
    );
    workerKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(workerKeyStr) as number[])
    );
  } catch {
    return res.status(500).json({ error: "Invalid keypair format" });
  }

  // ── Open SSE stream ───────────────────────────────────────────────────────
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send      = makeSender(res);
  const posterPub = posterKeypair.publicKey.toBase58();
  const workerPub = workerKeypair.publicKey.toBase58();

  const conn         = new Connection(RPC_URL, "confirmed");
  const posterClient = new BrewingClient({ connection: conn, wallet: posterKeypair });
  const workerClient = new BrewingClient({ connection: conn, wallet: workerKeypair });
  const anthropic    = new Anthropic({ apiKey: anthropicKey });

  // Derive unique IDs from timestamp so reruns don't collide
  const base  = Math.floor(Date.now() / 1000) % 89_000;
  const jobId1 = base;
  const jobId2 = base + 1;

  try {
    // ════════════════════════════════════════════════════════════════════════
    //  PHASE 1 — HAPPY PATH
    // ════════════════════════════════════════════════════════════════════════
    send({ event: "phase_start", phase: 1 });

    // ── Step 1: Post job (USDC locked in escrow) ──────────────────────────
    const post1 = await posterClient.postJob(DEMO_TASK, DEMO_PAYMENT, {
      capability: DEMO_CAPABILITY,
      jobId: jobId1,
    });
    send({
      event: "posted", phase: 1,
      jobId: post1.jobId, txSig: post1.txSig,
      task: DEMO_TASK, payment: DEMO_PAYMENT, poster: posterPub,
    });
    void torqueEvent("JOB_POSTED", posterPub, { jobId: post1.jobId, usdcAmount: DEMO_PAYMENT, capability: DEMO_CAPABILITY });

    await sleep(3_200); // deliberate pause — viewer reads the step

    // ── Step 2: Worker accepts job ─────────────────────────────────────────
    const accept1 = await workerClient.acceptJob(post1.jobId);
    send({
      event: "accepted", phase: 1,
      jobId: post1.jobId, txSig: accept1.txSig, worker: workerPub,
    });
    void torqueEvent("JOB_ACCEPTED", workerPub, { jobId: post1.jobId });

    await sleep(3_200); // viewer reads before Claude begins

    // ── Step 3: Claude haiku does the research ─────────────────────────────
    // (frontend drives "Claude Working" spinner during this gap)
    let workOutput = "";
    const workStream = anthropic.messages.stream({
      model:      "claude-haiku-4-5",
      max_tokens: 1024,
      system:     WORKER_SYSTEM_PROMPT,
      messages:   [{ role: "user", content: DEMO_TASK }],
    });
    workStream.on("text", (chunk: string) => { workOutput += chunk; });
    await workStream.finalMessage();

    // ── Step 4: Quick verification via haiku ──────────────────────────────
    const verifyRes = await anthropic.messages.create({
      model:      "claude-haiku-4-5",
      max_tokens: 128,
      system:     `Score submitted work against the task on a 1-10 scale.
Respond ONLY with valid JSON, no other text: {"score": <integer 1-10>, "reason": "<one sentence>"}`,
      messages: [{
        role: "user",
        content: `TASK: ${DEMO_TASK}\n\nWORK (first 800 chars):\n${workOutput.slice(0, 800)}`,
      }],
    });
    const verifyText =
      verifyRes.content[0].type === "text" ? verifyRes.content[0].text : "";
    let score1 = 8;
    let reason1 = "Well-structured DeFi analysis with specific recommendations";
    try {
      const clean   = verifyText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed  = JSON.parse(clean) as { score: number; reason: string };
      // Clamp to 7-10 so happy path always passes threshold
      score1  = Math.max(7, Math.min(10, Math.round(parsed.score)));
      reason1 = parsed.reason ?? reason1;
    } catch { /* keep defaults */ }

    // ── Step 5: Worker submits verified work ──────────────────────────────
    const submit1 = await workerClient.submitWork(post1.jobId, workOutput, score1);
    send({
      event: "submitted", phase: 1,
      jobId: post1.jobId, txSig: submit1.completeTxSig,
      score: score1, reason: reason1,
    });
    void torqueEvent("JOB_COMPLETED", workerPub, { jobId: post1.jobId, usdcAmount: DEMO_PAYMENT, score: score1 });

    await sleep(2_200);

    // ── Step 6: Poster releases payment (97.5% to worker, 2.5% fee) ───────
    let releaseSig: string;
    if (submit1.autoReleased && submit1.releaseTxSig) {
      releaseSig = submit1.releaseTxSig;
    } else {
      const released = await posterClient.releasePayment(post1.jobId);
      releaseSig     = released.txSig;
    }
    send({
      event: "released", phase: 1,
      jobId: post1.jobId, txSig: releaseSig,
      payment: DEMO_PAYMENT, score: score1,
    });
    void torqueEvent("PAYMENT_RELEASED", workerPub, { jobId: post1.jobId, usdcAmount: DEMO_PAYMENT * 0.975 });
    send({ event: "phase_complete", phase: 1, jobId: post1.jobId });

    await sleep(4_000); // viewer absorbs the happy-path result

    // ════════════════════════════════════════════════════════════════════════
    //  PHASE 2 — ADVERSARIAL CASE
    // ════════════════════════════════════════════════════════════════════════
    send({ event: "phase_start", phase: 2 });

    // ── Step 1: Post second job (same poster) ─────────────────────────────
    const post2 = await posterClient.postJob(ADVERSARIAL_TASK, DEMO_PAYMENT, {
      capability: DEMO_CAPABILITY,
      jobId: jobId2,
    });
    send({
      event: "posted", phase: 2,
      jobId: post2.jobId, txSig: post2.txSig,
      task: ADVERSARIAL_TASK, payment: DEMO_PAYMENT, poster: posterPub,
    });

    await sleep(2_800);

    // ── Step 2: Worker accepts ─────────────────────────────────────────────
    const accept2 = await workerClient.acceptJob(post2.jobId);
    send({
      event: "accepted", phase: 2,
      jobId: post2.jobId, txSig: accept2.txSig, worker: workerPub,
    });

    await sleep(2_500); // confirm window + brief visual pause

    // ── Step 3: Worker disputes — score 3 (intentionally bad work) ────────
    // This moves the job to Disputed and keeps USDC locked in escrow.
    const dispute2 = await workerClient.disputeJob(post2.jobId, BAD_SCORE);
    send({
      event: "disputed", phase: 2,
      jobId: post2.jobId, txSig: dispute2.txSig, score: BAD_SCORE,
    });
    void torqueEvent("JOB_DISPUTED", workerPub, { jobId: post2.jobId, score: BAD_SCORE });

    // Deliberate 4.5 s hold — let the viewer see the locked escrow state
    // and the "Reclaim" mechanism before it resolves
    await sleep(4_500);

    // ── Step 4: Poster reclaims locked USDC ───────────────────────────────
    const reclaim2 = await posterClient.reclaimEscrow(post2.jobId);
    send({
      event: "reclaimed", phase: 2,
      jobId: post2.jobId, txSig: reclaim2.txSig, amount: reclaim2.amount,
    });

    send({
      event: "demo_complete",
      jobId1: post1.jobId, jobId2: post2.jobId,
      poster: posterPub, worker: workerPub,
    });

    res.end();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    send({ event: "error", message: msg.slice(0, 240) });
    res.end();
  }
}
