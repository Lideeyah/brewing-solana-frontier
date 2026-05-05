#!/usr/bin/env tsx
/**
 * Brewing Poster Daemon
 * ─────────────────────────────────────────────────────────────────────────────
 * The other half of a fully autonomous agent economy.
 *
 * Two responsibilities:
 *   1. Keeps the job board populated — if open jobs drop below MIN_OPEN_JOBS
 *      it immediately posts a new job from the rotating JOB_POOL.
 *   2. Auto-releases payment — any job posted by this wallet that reaches
 *      PendingRelease is automatically approved and USDC sent to the worker.
 *
 * ── Setup ────────────────────────────────────────────────────────────────────
 *   cp .env.example .env
 *   # set POSTER_SECRET_KEY
 *   npm run poster
 *
 * Run alongside `npm run worker` for the full autonomous pipeline:
 *   Terminal A: npm run poster   ← posts jobs + auto-releases payment
 *   Terminal B: npm run worker   ← accepts + completes research tasks
 *
 * Or post jobs separately with `npm run post-job` and let this daemon
 * release payments when workers deliver.
 */

import dotenv from "dotenv";
dotenv.config({ override: true });
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, getAccount } from "@solana/spl-token";
import { BrewingClient, TREASURY_PUBKEY, DEVNET_USDC_MINT } from "../sdk/src/index";

// ── Task complexity pricing ───────────────────────────────────────────────────
const PRICE_TIERS: Record<string, [number, number, number]> = {
  research: [0.05, 0.10, 0.20],
  trading:  [0.10, 0.15, 0.25],
  coding:   [0.15, 0.20, 0.30],
  writing:  [0.05, 0.10, 0.15],
};

function scoreTask(task: string): number {
  const t = task.toLowerCase();
  const words = t.split(/\s+/).filter(Boolean);
  let score = 0;

  if (words.length > 20)  score += 1;
  if (words.length > 50)  score += 1;
  if (words.length > 100) score += 1;

  const numberedSteps = (task.match(/\(\d+\)|\b\d+[.)]\s/g) ?? []).length;
  score += Math.min(numberedSteps, 4);

  const deliverables = ['write','return','build','calculate','produce','generate',
    'implement','create','design','output','compare','evaluate','specify','include'];
  score += Math.min(deliverables.filter(k => t.includes(k)).length, 3);

  const constraints = ['must','should','ensure','validate','handle','without',
    'only if','at least','no more than','never','always'];
  score += Math.min(constraints.filter(k => t.includes(k)).length, 3);

  const numerals = (task.match(/\b(top\s*\d+|\d+\s*(protocol|scenario|option|token|case|step|exchange|wallet|validator)s?)\b/gi) ?? []).length;
  score += Math.min(numerals, 3);

  if (t.includes('test') || t.includes('mocha') || t.includes('chai')) score += 2;
  if (t.includes('table') || t.includes('comparison table'))            score += 1;
  if (t.includes('end-to-end') || t.includes('step-by-step'))          score += 1;

  return score;
}

function estimatePrice(task: string, capability: string): number {
  const score = scoreTask(task);
  const [low, mid, high] = PRICE_TIERS[capability] ?? [0.10, 0.15, 0.20];
  if (score <= 2)  return low;
  if (score <= 7)  return mid;
  return high;
}

// ── Config ────────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS  = 20_000;
const MIN_OPEN_JOBS     = 2;   // keep at least this many open jobs on the board
const RPC_URL           = process.env.RPC_URL ?? "https://api.devnet.solana.com";

// ── Job pool — rotated to keep the board populated ────────────────────────────
type JobSpec = { capability: string; task: string; payment: number };
const JOB_POOL: JobSpec[] = [
  // ── Research ────────────────────────────────────────────────────────────────
  {
    capability: "research",
    payment: 0.10,
    task: "Analyse the top 3 Solana liquid staking protocols (Marinade, Jito, Sanctum). Compare APY, TVL, validator set size, and slashing risk. Produce a ranked recommendation with rationale.",
  },
  {
    capability: "research",
    payment: 0.10,
    task: "Research the current state of Solana DeFi: identify the 5 largest protocols by TVL, their dominant token pairs, and 30-day volume trends. Summarise key risks and growth catalysts.",
  },
  {
    capability: "research",
    payment: 0.10,
    task: "Investigate recent Solana validator performance: average block time, skip rate, and geographic distribution. Identify the top 3 validators by uptime and stake weight.",
  },
  {
    capability: "research",
    payment: 0.10,
    task: "Compare yield opportunities across Solana lending protocols (Marginfi, Kamino, Drift). Include current supply APY for USDC, SOL, and JitoSOL with risk-adjusted rankings.",
  },
  // ── Trading ──────────────────────────────────────────────────────────────────
  {
    capability: "trading",
    payment: 0.15,
    task: "Design a SOL/USDC momentum strategy for Drift Protocol. Specify: (1) entry signals using a 20/50 EMA crossover on 4H candles, (2) position sizing at 2% portfolio risk per trade with ATR-based stops, (3) a funding-rate filter to avoid paying negative funding.",
  },
  {
    capability: "trading",
    payment: 0.15,
    task: "Develop a mean-reversion strategy for the JitoSOL/SOL pool on Orca. Define entry/exit z-score thresholds, maximum holding period, fee drag calculation, and expected Sharpe ratio.",
  },
  {
    capability: "trading",
    payment: 0.15,
    task: "Evaluate a SOL perpetual long strategy on Drift with 2× leverage. Calculate expected value under three scenarios: bull (+40%), base (+10%), bear (-25%). Include liquidation price and max drawdown.",
  },
  {
    capability: "trading",
    payment: 0.15,
    task: "Design a delta-neutral SOL yield strategy: long SOL spot on Marginfi, short SOL-PERP on Drift. Specify rebalancing triggers, borrowing cost analysis, and break-even funding rate.",
  },
  // ── Coding ───────────────────────────────────────────────────────────────────
  {
    capability: "coding",
    payment: 0.20,
    task: "Write a TypeScript function using @solana/web3.js that fetches the 10 most recent transactions for a given public key, decodes SPL token transfer instructions, and returns a structured array of {mint, amount, direction, timestamp} objects. Include error handling and a usage example.",
  },
  {
    capability: "coding",
    payment: 0.20,
    task: "Implement a TypeScript class using @coral-xyz/anchor that monitors a Drift Protocol perp market for large trades (>$10,000 notional) and emits events via an EventEmitter. Include WebSocket subscription setup, reconnection logic, and a usage example.",
  },
  {
    capability: "coding",
    payment: 0.20,
    task: "Build a TypeScript utility that calculates the optimal swap route between any two SPL tokens using Jupiter's quote API. Accept input/output mint addresses and amount, return the best route with price impact and expected output. Include rate limiting and error handling.",
  },
  {
    capability: "coding",
    payment: 0.20,
    task: "Write a TypeScript script that checks the health of a Marginfi borrow position: fetches account data, calculates current LTV, equity, and distance-to-liquidation, and sends a console warning when LTV exceeds 70%. Include a simulation mode that uses mock data.",
  },
  // ── Writing ──────────────────────────────────────────────────────────────────
  {
    capability: "writing",
    payment: 0.10,
    task: "Write a 200-word Twitter/X thread (5 tweets) announcing a new Solana DeFi protocol launch. Lead with a hook about yield opportunities, explain the core mechanism, address safety, and close with a CTA. Use clear language, no jargon.",
  },
  {
    capability: "writing",
    payment: 0.10,
    task: "Draft a 300-word technical blog post introduction explaining how Solana's proof-of-history consensus works to a developer audience. Cover: what PoH solves, how it interacts with PoS, and why it enables high throughput. No fluff.",
  },
  {
    capability: "writing",
    payment: 0.10,
    task: "Write product documentation for a Solana wallet SDK: cover installation (npm), initialising a connection, signing a transaction, and handling errors. Include concise code snippets. Target audience: JavaScript developers new to Solana.",
  },
  {
    capability: "writing",
    payment: 0.10,
    task: "Compose a 250-word investor update email for a Solana DeFi startup: Q1 metrics (TVL, volume, users), one key product milestone, one risk factor and mitigation, and a Q2 outlook. Professional tone, data-driven.",
  },
];
const EXPLORER_TX      = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// ── Validate environment ──────────────────────────────────────────────────────
if (!process.env.POSTER_SECRET_KEY) {
  console.error("❌  POSTER_SECRET_KEY not set. See demo/.env.example");
  process.exit(1);
}

// ── Parse poster keypair ──────────────────────────────────────────────────────
let posterKeypair: Keypair;
try {
  posterKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.POSTER_SECRET_KEY) as number[])
  );
} catch {
  console.error("❌  POSTER_SECRET_KEY must be a JSON byte-array (e.g. [1,2,3,...,64]).");
  process.exit(1);
}

// ── Logger ────────────────────────────────────────────────────────────────────
const ts  = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (msg: string) => console.log(`[${ts()}]  ${msg}`);
const err = (msg: string) => console.error(`[${ts()}]  ❌ ${msg}`);

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const conn   = new Connection(RPC_URL, "confirmed");
  const client = new BrewingClient({ connection: conn, wallet: posterKeypair });
  const me     = posterKeypair.publicKey.toBase58();

  // ── Banner ─────────────────────────────────────────────────────────────────
  console.log();
  console.log("╔═════════════════════════════════════════════════════════════╗");
  console.log("║     BREWING POSTER DAEMON  —  Post Jobs + Auto-Release     ║");
  console.log("╚═════════════════════════════════════════════════════════════╝");
  console.log();
  log(`Poster wallet : ${me}`);
  log(`Poll interval : every ${POLL_INTERVAL_MS / 1000}s`);
  console.log();

  // Ensure SOL for release transactions
  const lamports = await conn.getBalance(posterKeypair.publicKey);
  if (lamports < 0.05 * LAMPORTS_PER_SOL) {
    log("SOL balance low — requesting devnet airdrop…");
    const ok = await requestAirdropWithRetry(posterKeypair.publicKey, conn);
    if (!ok) {
      log("⚠️  Auto-airdrop failed. Fund manually:");
      log("    https://faucet.solana.com  →  paste poster address  →  Devnet");
      log(`    Address: ${posterKeypair.publicKey.toBase58()}`);
      log("   (daemon will continue — fund the wallet then retry transactions)");
    }
  } else {
    log(`SOL balance   : ${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  }

  // Ensure the protocol treasury's USDC token account exists on-chain.
  // release_payment sends 2.5% there — if the ATA is missing the tx errors.
  const usdcMint = new PublicKey(DEVNET_USDC_MINT);
  let posterAta: Awaited<ReturnType<typeof getOrCreateAssociatedTokenAccount>> | null = null;
  try {
    const treasuryAta = await getOrCreateAssociatedTokenAccount(
      conn, posterKeypair, usdcMint, TREASURY_PUBKEY
    );
    log(`Treasury ATA  : ${treasuryAta.address.toBase58()} (ready)`);
    posterAta = await getOrCreateAssociatedTokenAccount(
      conn, posterKeypair, usdcMint, posterKeypair.publicKey
    );
    const usdcBalance = Number(posterAta.amount) / 1_000_000;
    log(`USDC balance  : ${usdcBalance.toFixed(4)} USDC`);
    if (usdcBalance < 0.25) {
      log("⚠️  USDC balance low — posting will be skipped until refilled.");
      log("    Get devnet USDC: https://faucet.circle.com");
      log(`    Select Solana Devnet, paste: ${posterKeypair.publicKey.toBase58()}`);
    }
  } catch (e) {
    log(`⚠️  Could not init treasury ATA: ${(e as Error).message}`);
  }

  console.log();
  log("Mode          : release-only (posting disabled)");
  log("Watching for PendingRelease jobs to auto-approve…");
  log("Press Ctrl+C to stop.\n");

  // Track released/reclaimed jobs so we never double-process
  const released  = new Set<number>();
  const reclaimed = new Set<number>();
  let pollCount   = 0;

  // ── Poll loop ──────────────────────────────────────────────────────────────
  while (true) {
    try {
      const allJobs = await client.getAllJobs();

      // ── 1. Release any PendingRelease jobs this poster owns ───────────────
      const pending = allJobs.filter(
        (j) =>
          j.status === "PendingRelease" &&
          j.posterAgent === me &&
          !released.has(j.jobId)
      );

      if (pending.length === 0) {
        log("No pending releases.");
      } else {
        log(`${pending.length} job(s) awaiting approval.`);
        for (const job of pending) {
          released.add(job.jobId);
          log(`${"─".repeat(63)}`);
          log(`Releasing #${job.jobId}  ${job.paymentAmount.toFixed(2)} USDC`);
          log(`  Worker : ${job.workerAgent}`);
          log(`  Task   : "${job.task.slice(0, 70)}${job.task.length > 70 ? "…" : ""}"`);
          try {
            const { txSig } = await client.releasePayment(job.jobId);
            log(`✅  #${job.jobId} paid — ${EXPLORER_TX(txSig)}`);
          } catch (e) {
            err(`Release failed for #${job.jobId}: ${(e as Error).message}`);
            released.delete(job.jobId);
          }
        }
      }

      // ── 2. Reclaim disputed jobs and immediately re-post for a fresh attempt ─
      const disputed = allJobs.filter(
        (j) =>
          j.status === "Disputed" &&
          j.posterAgent === me &&
          !reclaimed.has(j.jobId)
      );

      for (const job of disputed) {
        reclaimed.add(job.jobId);
        log(`${"─".repeat(63)}`);
        log(`♻️  Reclaiming escrow on disputed #${job.jobId}  ${job.paymentAmount.toFixed(2)} USDC`);
        log(`  Task : "${job.task.slice(0, 70)}${job.task.length > 70 ? "…" : ""}"`);
        try {
          const { txSig: reclaimTx } = await client.reclaimEscrow(job.jobId);
          log(`✅  #${job.jobId} reclaimed — ${EXPLORER_TX(reclaimTx)}`);

          // Re-post the same task immediately so workers get another attempt.
          // Recalculate price from task complexity — don't reuse the old disputed price.
          const repostPrice = estimatePrice(job.task, job.capability ?? 'research');
          log(`📋  Re-posting #${job.jobId} task as a fresh job (${repostPrice.toFixed(2)} USDC)…`);
          const newJobId = Math.floor(Date.now() / 1000) % 99_000;
          const { jobId: repostedId, txSig: repostTx } = await client.postJob(
            job.task, repostPrice, { capability: job.capability, jobId: newJobId }
          );
          log(`✅  Re-posted as #${repostedId} [${job.capability}] ${repostPrice.toFixed(2)} USDC — ${EXPLORER_TX(repostTx)}`);
        } catch (e) {
          err(`Reclaim/repost failed for #${job.jobId}: ${(e as Error).message}`);
          reclaimed.delete(job.jobId);
        }
      }

    } catch (e) {
      err(`Poll error: ${(e as Error).message}`);
    }

    // ── Periodic SOL top-up (every 10 polls ≈ 100 s) ──────────────────────
    if (++pollCount % 10 === 0) {
      try {
        const lamports = await conn.getBalance(posterKeypair.publicKey);
        if (lamports < 0.05 * LAMPORTS_PER_SOL) {
          log(`⚠️  SOL low (${(lamports / LAMPORTS_PER_SOL).toFixed(4)}) — requesting airdrop…`);
          const ok = await requestAirdropWithRetry(posterKeypair.publicKey, conn);
          if (!ok) log("⚠️  Airdrop failed — fund manually at https://faucet.solana.com");
        }
      } catch { /* non-fatal — skip this check and continue */ }
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry airdrop across two RPC endpoints — devnet faucet is often flaky
async function requestAirdropWithRetry(
  pubkey: import("@solana/web3.js").PublicKey,
  primaryConn: Connection,
  attempts = 3
): Promise<boolean> {
  const { Connection: Conn } = await import("@solana/web3.js");
  const endpoints = [
    RPC_URL,
    "https://rpc.ankr.com/solana_devnet",
  ];
  for (let i = 0; i < attempts; i++) {
    const endpoint = endpoints[i % endpoints.length];
    try {
      const c = endpoint === RPC_URL ? primaryConn : new Conn(endpoint, "confirmed");
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

main().catch((e: Error) => {
  console.error(`\n💥  Poster daemon crashed: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
