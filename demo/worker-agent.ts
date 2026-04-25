#!/usr/bin/env tsx
/**
 * Brewing Worker Agent  —  universal, capability-configurable
 * ─────────────────────────────────────────────────────────────────────────────
 * A self-running agent that operates indefinitely without human intervention.
 * The same script handles any capability type — just set WORKER_CAPABILITY.
 *
 *   1. Polls Brewing every 10 s for open jobs matching WORKER_CAPABILITY
 *   2. Skips jobs below MIN_PAYMENT_USDC (default: 0.01)
 *   3. Accepts each matching job on-chain
 *   4. Calls Claude claude-opus-4-7 (adaptive thinking) with the job prompt
 *   5. Submits the AI response as work output on-chain
 *   6. Waits for payment confirmation (USDC released by the poster daemon)
 *
 * ── Capability types ─────────────────────────────────────────────────────────
 *   WORKER_CAPABILITY=research   Research, analysis, summarisation
 *   WORKER_CAPABILITY=coding     Code generation, debugging, review
 *   WORKER_CAPABILITY=trading    Price analysis, strategy evaluation
 *   WORKER_CAPABILITY=writing    Copywriting, content, translation
 *
 * ── Convenience scripts ──────────────────────────────────────────────────────
 *   npm run worker              (research — default)
 *   npm run worker:coding
 *   npm run worker:trading
 *   npm run worker:writing
 *
 * ── Full setup ────────────────────────────────────────────────────────────────
 *   cp .env.example .env        # fill in keys
 *   npm start                   # runs poster daemon + research worker together
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

// ── Config — all overridable via environment variables ────────────────────────
const CAPABILITY        = process.env.WORKER_CAPABILITY   ?? "research";
const MIN_PAYMENT_USDC  = parseFloat(process.env.MIN_PAYMENT_USDC ?? "0.01");
const POLL_INTERVAL_MS  = 10_000;
const PAYMENT_WAIT_MS   = 10 * 60_000;
const PAYMENT_POLL_MS   = 8_000;
const RPC_URL           = "https://api.devnet.solana.com";
const USDC_MINT         = new PublicKey(DEVNET_USDC_MINT);
const EXPLORER_TX       = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// ── Capability-specific system prompts ────────────────────────────────────────
const SYSTEM_PROMPTS: Record<string, string> = {
  research: `You are a Research Analyst agent operating in the Brewing decentralised AI job marketplace on Solana. Your responses are submitted on-chain and paid in USDC — rigour, depth, and clarity are your competitive advantage.

STRUCTURE every response as: ## Summary (3 sentences max) → ## Analysis (evidence-backed sections) → ## Key Findings (bullet points with specific data) → ## Takeaways (2–3 actionable conclusions).
QUANTIFY all claims with percentages, dates, dollar figures, and named sources wherever possible.
COMPARE alternatives using tables when evaluating 3 or more options side-by-side.
FLAG knowledge cutoffs, assumptions, and confidence levels explicitly — intellectual honesty is alpha.

No preamble. No affirmations. No "Great question!". Lead immediately with the most important finding.`,

  trading: `You are a Quantitative DeFi Trading Analyst agent operating in the Brewing decentralised AI job marketplace on Solana. You operate in adversarial, volatile markets — risk management is your first obligation, returns are second.

STRUCTURE every response as: ## Market Context → ## Strategy Specification → ## Risk Parameters → ## Execution Notes → ## Verdict.
ALWAYS define for any strategy: entry signal, stop-loss level, take-profit target, position size (as % of portfolio), and maximum concurrent exposure.
ALWAYS report: expected value, estimated win rate, risk/reward ratio, max drawdown estimate, and Sharpe ratio where calculable.
CALL OUT on-chain specific risks explicitly: smart-contract risk, oracle manipulation, liquidity fragmentation, funding rate flips, and MEV exposure.
If a strategy is net-negative expected value, say so clearly and recommend alternatives — honesty is alpha.

No preamble. Lead with the single most critical number or signal.`,

  coding: `You are a Senior Solana/TypeScript Engineer agent operating in the Brewing decentralised AI job marketplace. Your code runs in production against a live blockchain — correctness and security are non-negotiable.

ALWAYS produce: (1) a 2–4 sentence architecture comment explaining the approach and key design decisions, (2) complete, immediately runnable TypeScript with strict types and inline comments, (3) a concrete usage example, (4) a note on edge cases or known limitations.
NEVER use \`any\` unless unavoidable — if you must, explain why in a comment.
HANDLE all error cases explicitly: use typed errors, include retry logic for RPC calls, and never let exceptions propagate silently.
FOR on-chain code: validate all accounts, check signer and ownership constraints, guard against integer overflow, and document every PDA derivation.
WRITE tests (mocha/chai) for any non-trivial logic.

No preamble. Return working code immediately.`,

  writing: `You are a Professional Writer and Editor agent operating in the Brewing decentralised AI job marketplace on Solana. Your copy is delivered on-chain — every word must earn its place.

MATCH tone and format exactly to the brief: identify whether the task calls for technical documentation, marketing copy, long-form editorial, or social content, then execute accordingly.
STRUCTURE content with clear hierarchy: lead with the hook, build with evidence, close with a call to action or conclusion.
EDIT ruthlessly: cut filler phrases, passive voice, and redundant qualifiers. Aim for the minimum word count that achieves maximum impact.
FLAG any ambiguity in the brief with a brief assumption note before delivering the output.

No preamble. Deliver the finished piece immediately.`,
};

const SYSTEM_PROMPT =
  process.env.WORKER_SYSTEM_PROMPT ??
  SYSTEM_PROMPTS[CAPABILITY] ??
  "You are a skilled AI agent. Complete the task accurately and concisely.";

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
  const bannerTitle = `BREWING ${CAPABILITY.toUpperCase()} WORKER AGENT  —  Starting`;
  const bannerWidth = 63;
  const bannerPad   = Math.max(0, bannerWidth - bannerTitle.length);
  const bannerLine  = " ".repeat(Math.floor(bannerPad / 2)) + bannerTitle +
                      " ".repeat(Math.ceil(bannerPad / 2));
  console.log();
  console.log(`╔${"═".repeat(bannerWidth)}╗`);
  console.log(`║${bannerLine}║`);
  console.log(`╚${"═".repeat(bannerWidth)}╝`);
  console.log();
  log(`Capability    : ${CAPABILITY}`);
  log(`Min payment   : ${MIN_PAYMENT_USDC.toFixed(2)} USDC`);
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
  let pollCount = 0;

  // ── Poll loop ──────────────────────────────────────────────────────────────
  while (true) {
    try {
      const openJobs = await client.getOpenJobs(CAPABILITY);
      const newJobs  = openJobs.filter(
        (j) => !processing.has(j.jobId) && j.paymentAmount >= MIN_PAYMENT_USDC
      );

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

    // ── Periodic balance check + SOL top-up (every 10 polls ≈ 100 s) ──────
    if (++pollCount % 10 === 0) {
      try {
        const lamports = await conn.getBalance(workerKeypair.publicKey);
        if (lamports < 0.05 * LAMPORTS_PER_SOL) {
          log(`⚠️  SOL low (${(lamports / LAMPORTS_PER_SOL).toFixed(4)}) — requesting airdrop…`);
          const ok = await requestAirdropWithRetry(workerKeypair.publicKey, conn);
          if (!ok) log("⚠️  Airdrop failed — fund manually at https://faucet.solana.com");
        }
        const acct = await getAccount(conn, workerAtaInfo.address);
        const usdc = Number(acct.amount) / 1_000_000;
        log(`💳 Balance — SOL: ${(lamports / LAMPORTS_PER_SOL).toFixed(4)}  USDC: ${usdc.toFixed(4)}`);
      } catch { /* non-fatal — skip this check and continue */ }
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
    system: SYSTEM_PROMPT,
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
