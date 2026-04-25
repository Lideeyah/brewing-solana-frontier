#!/usr/bin/env tsx
/**
 * Brewing — Post Jobs CLI
 * ─────────────────────────────────────────────────────────────────────────────
 * Post realistic demo jobs for any or all capability types.
 * Workers running via `npm start` will pick them up within 10 seconds.
 *
 * Usage:
 *   npm run post-job                              # post all 3 demo jobs at once
 *   npm run post-job -- research                  # post the research demo job
 *   npm run post-job -- trading                   # post the trading demo job
 *   npm run post-job -- coding                    # post the coding demo job
 *   npm run post-job -- research "custom task" 0.10  # custom task + payment
 *
 * Requires POSTER_SECRET_KEY in demo/.env with sufficient devnet USDC.
 * Get devnet USDC at: https://faucet.circle.com (select Solana Devnet)
 */

import "dotenv/config";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { BrewingClient, DEVNET_USDC_MINT } from "../sdk/src/index";

// ── Task pool — multiple varied tasks per capability ──────────────────────────
// Each run picks one task per capability (or the first if running via CLI).
const TASK_POOL: Record<string, Array<{ task: string; payment: number; label: string }>> = {
  research: [
    {
      label: "Solana DeFi Ecosystem Analysis",
      payment: 0.10,
      task:
        "Analyse the current Solana DeFi ecosystem: identify the top 5 protocols by TVL, " +
        "explain each protocol's core mechanic, and compare their risk profiles across " +
        "smart-contract risk, liquidity risk, and oracle dependency. Include a comparison " +
        "table and end with a clear recommendation for the best risk-adjusted yield on a $10,000 position.",
    },
    {
      label: "AI Agent Infrastructure on Solana",
      payment: 0.10,
      task:
        "Research the current state of AI agent infrastructure on Solana. Identify the top 5 " +
        "protocols enabling autonomous agent-to-agent interactions: explain their mechanisms, " +
        "token economics, and traction metrics. Compare them on programmability, latency, and " +
        "cost. Conclude with which stack you'd recommend for a new agent marketplace.",
    },
    {
      label: "Solana vs Ethereum L2 Comparison",
      payment: 0.10,
      task:
        "Compare Solana vs Ethereum L2s (Arbitrum, Optimism, Base) for deploying a DeFi protocol " +
        "in 2025. Analyse gas costs, developer tooling maturity, TVL trends, and user acquisition " +
        "potential. Produce a scored comparison table (1-10 per dimension) and give a final " +
        "recommendation with supporting rationale.",
    },
  ],
  trading: [
    {
      label: "SOL/USDC Momentum Strategy",
      payment: 0.15,
      task:
        "Design a SOL/USDC momentum strategy for Drift Protocol. Specify: " +
        "(1) entry signals using a 20/50 EMA crossover on 4H candles, " +
        "(2) position sizing at 2% portfolio risk per trade with ATR-based stops, " +
        "(3) a funding-rate filter to avoid paying negative funding on longs, " +
        "(4) estimated Sharpe ratio and monthly win rate given SOL's historical volatility. " +
        "Walk through one concrete example trade end-to-end.",
    },
    {
      label: "Delta-Neutral Yield on Drift",
      payment: 0.15,
      task:
        "Design a delta-neutral yield strategy using SOL-PERP on Drift Protocol. " +
        "Specify: borrow SOL spot, sell equivalent SOL-PERP to hedge delta, earn funding rate. " +
        "Quantify: expected APY at current average funding rates, liquidation risk thresholds, " +
        "max recommended position size, and slippage cost model. Include a step-by-step execution plan.",
    },
    {
      label: "BONK/USDC Mean-Reversion Strategy",
      payment: 0.15,
      task:
        "Build a mean-reversion strategy for BONK/USDC on Raydium. Specify: " +
        "entry trigger (Bollinger Band 2σ breach on 1H), exit (price returns to 20-period MA), " +
        "position size using half-Kelly criterion, and stop-loss at 3σ. " +
        "Estimate: expected monthly win rate, average holding period, and maximum drawdown " +
        "based on BONK's 90-day volatility history.",
    },
  ],
  coding: [
    {
      label: "Solana Wallet Monitor Class",
      payment: 0.20,
      task:
        "Write a TypeScript WalletMonitor class for Solana. Requirements: " +
        "(1) constructor takes a wallet address array and SOL threshold, " +
        "(2) polls every 30s with exponential backoff on RPC errors, " +
        "(3) calls an onAlert(cb) handler when any wallet drops below threshold, " +
        "(4) exposes start() and stop() with cleanup. " +
        "Include strict TypeScript types, explicit error handling, " +
        "and a mocha/chai test for the threshold detection logic.",
    },
    {
      label: "SPL Token Portfolio Fetcher",
      payment: 0.20,
      task:
        "Write a TypeScript function fetchPortfolio(walletAddress: string) for Solana that: " +
        "(1) fetches all SPL token balances using getTokenAccountsByOwner, " +
        "(2) resolves USD prices for each token via Jupiter Price API v2, " +
        "(3) returns a typed Portfolio object with total USD value and per-token breakdown, " +
        "(4) handles missing prices gracefully. " +
        "Include strict types, retry logic with exponential backoff, and a usage example.",
    },
    {
      label: "Solana Program Log Subscriber",
      payment: 0.20,
      task:
        "Build a TypeScript class ProgramLogSubscriber for Solana that: " +
        "(1) subscribes to program logs for a given programId using onLogs, " +
        "(2) filters events by instruction discriminator (first 8 bytes), " +
        "(3) decodes matched log data using a provided Borsh schema, " +
        "(4) calls a typed callback with the decoded event, " +
        "(5) reconnects automatically on WebSocket disconnect with exponential backoff. " +
        "Include strict types and a working usage example.",
    },
  ],
  writing: [
    {
      label: "Protocol Launch Twitter Thread",
      payment: 0.08,
      task:
        "Write an 8-tweet Twitter thread announcing the launch of Brewing — an AI agent job " +
        "marketplace on Solana where agents autonomously post, accept, and complete paid tasks. " +
        "Lead with the biggest user benefit, build to the mechanics (escrow, Claude verification, " +
        "2.5% fee split), and close with a call-to-action linking to the dashboard. " +
        "Technical audience. No emojis. Max 280 chars per tweet.",
    },
    {
      label: "Developer Landing Page Copy",
      payment: 0.08,
      task:
        "Write landing page copy for Brewing, an onchain AI agent marketplace on Solana. " +
        "Produce three sections: (1) hero — one tagline + one subheading (40 words max), " +
        "(2) three feature bullets (15 words each): autonomous execution, Claude verification, " +
        "instant USDC settlement; (3) a trust-building footer line referencing on-chain " +
        "verifiability. Tone: developer-first, precise, no hype.",
    },
  ],
};

// Default demo jobs — one per capability (first task in each pool)
const DEMO_JOBS: Record<string, { task: string; payment: number; label: string }> = {
  research: TASK_POOL.research[0],
  trading:  TASK_POOL.trading[0],
  coding:   TASK_POOL.coding[0],
  writing:  TASK_POOL.writing[0],
};

type Capability = keyof typeof DEMO_JOBS;
const ALL_CAPS = Object.keys(DEMO_JOBS) as Capability[];

// ── Validate environment ──────────────────────────────────────────────────────
if (!process.env.POSTER_SECRET_KEY) {
  console.error("❌  POSTER_SECRET_KEY not set. See demo/.env.example");
  process.exit(1);
}

let posterKeypair: Keypair;
try {
  posterKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.POSTER_SECRET_KEY) as number[])
  );
} catch {
  console.error("❌  POSTER_SECRET_KEY must be a JSON byte-array.");
  process.exit(1);
}

// ── Parse CLI args ────────────────────────────────────────────────────────────
// Modes:
//   (no args)                 → post all demo jobs
//   <cap>                     → post demo job for that capability
//   <cap> "<task>" <amount>   → post custom task for that capability
//   "<task>" <amount>         → backwards-compat (defaults to research)
const [, , arg1, arg2, arg3] = process.argv;

type JobSpec = { capability: Capability; task: string; payment: number; label: string };

function buildSpecs(): JobSpec[] {
  // No args → post all three demo jobs
  if (!arg1) {
    return ALL_CAPS.map((cap) => ({
      capability: cap,
      ...DEMO_JOBS[cap],
    }));
  }

  // arg1 is a known capability
  if (ALL_CAPS.includes(arg1 as Capability)) {
    const cap = arg1 as Capability;

    // Custom task provided
    if (arg2) {
      const payment = arg3 ? parseFloat(arg3) : DEMO_JOBS[cap].payment;
      if (isNaN(payment) || payment <= 0) {
        console.error("❌  Payment must be a positive number (e.g. 0.10)");
        process.exit(1);
      }
      return [{ capability: cap, task: arg2, payment, label: "Custom task" }];
    }

    // No custom task — use demo job for that capability
    return [{ capability: cap, ...DEMO_JOBS[cap] }];
  }

  // arg1 is not a capability → treat as custom task, default to research
  const payment = arg2 ? parseFloat(arg2) : DEMO_JOBS.research.payment;
  if (isNaN(payment) || payment <= 0) {
    console.error("❌  Payment must be a positive number (e.g. 0.10)");
    process.exit(1);
  }
  return [{ capability: "research", task: arg1, payment, label: "Custom task" }];
}

const specs = buildSpecs();
const totalPayment = specs.reduce((s, j) => s + j.payment, 0);

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const RPC_URL = "https://api.devnet.solana.com";
  const conn    = new Connection(RPC_URL, "confirmed");
  const client  = new BrewingClient({ connection: conn, wallet: posterKeypair });
  const USDC    = new PublicKey(DEVNET_USDC_MINT);

  // ── Banner ────────────────────────────────────────────────────────────────
  const jobWord = specs.length === 1 ? "Job" : "Jobs";
  const capList = specs.map((s) => s.capability).join(" + ");
  console.log();
  console.log(`╔${"═".repeat(65)}╗`);
  const title   = `BREWING — Posting ${specs.length} Demo ${jobWord}  (${capList})`;
  const padded  = title.padStart(Math.floor((65 + title.length) / 2)).padEnd(65);
  console.log(`║${padded}║`);
  console.log(`╚${"═".repeat(65)}╝`);
  console.log();

  log(`Poster wallet : ${posterKeypair.publicKey.toBase58()}`);

  // ── Preflight: validate encoded length before touching the chain ──────────
  const MAX_ENCODED = 512;
  for (const spec of specs) {
    const encoded = `[cap:${spec.capability}] ${spec.task}`;
    if (encoded.length > MAX_ENCODED) {
      console.error(
        `\n❌  Task for [${spec.capability}] is too long: ` +
        `encoded ${encoded.length} chars (max ${MAX_ENCODED}).\n` +
        `    Shorten by ${encoded.length - MAX_ENCODED} character(s).\n`
      );
      process.exit(1);
    }
  }

  // ── Check USDC balance ────────────────────────────────────────────────────
  let posterAta;
  try {
    posterAta = await getOrCreateAssociatedTokenAccount(
      conn, posterKeypair, USDC, posterKeypair.publicKey
    );
  } catch (e) {
    console.error(`❌  Could not access poster USDC account: ${(e as Error).message}`);
    process.exit(1);
  }

  const balance = Number(posterAta.amount) / 1_000_000;
  log(`USDC balance  : ${balance.toFixed(6)} USDC`);
  log(`Total payment : ${totalPayment.toFixed(2)} USDC (${specs.length} job${specs.length > 1 ? "s" : ""})`);

  if (balance < totalPayment) {
    console.error(`\n❌  Insufficient USDC. Need ${totalPayment.toFixed(2)}, have ${balance.toFixed(6)}.`);
    console.error(`    Wallet : ${posterKeypair.publicKey.toBase58()}`);
    console.error(`    Faucet : https://faucet.circle.com  (select Solana Devnet)\n`);
    process.exit(1);
  }

  // ── Ensure SOL for transaction fees ───────────────────────────────────────
  const lamports = await conn.getBalance(posterKeypair.publicKey);
  if (lamports < 0.01 * LAMPORTS_PER_SOL) {
    log("SOL balance low — requesting devnet airdrop…");
    const sig = await conn.requestAirdrop(posterKeypair.publicKey, LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
    log("✅  SOL airdrop confirmed.");
  }

  // ── Post jobs ─────────────────────────────────────────────────────────────
  console.log();
  if (specs.length > 1) {
    log("Posting jobs concurrently…");
  }
  console.log();

  for (const spec of specs) {
    const preview = spec.task.slice(0, 70) + (spec.task.length > 70 ? "…" : "");
    log(`  [${spec.capability.padEnd(8)}]  ${spec.payment.toFixed(2)} USDC  ${spec.label}`);
    log(`             "${preview}"`);
  }
  console.log();

  // Fire all posts in parallel — give each a unique ID so parallel jobs
  // don't collide on the same PDA (id is seconds-based; offset by index).
  const baseId = Math.floor(Date.now() / 1000) % 99_000;
  const results = await Promise.allSettled(
    specs.map((spec, i) =>
      client.postJob(spec.task, spec.payment, {
        capability: spec.capability,
        jobId: baseId + i,
      }).then((r) => ({ ...r, spec }))
    )
  );

  // ── Report results ────────────────────────────────────────────────────────
  let successCount = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      const { jobId, txSig, spec } = result.value;
      log(`✅  Job #${jobId}  [${spec.capability}]  ${spec.payment.toFixed(2)} USDC  — https://explorer.solana.com/tx/${txSig}?cluster=devnet`);
      successCount++;
    } else {
      log(`❌  Post failed: ${result.reason?.message ?? result.reason}`);
    }
  }

  console.log();
  if (successCount === specs.length) {
    log(`${successCount} job${successCount > 1 ? "s" : ""} posted successfully!`);
    log("Workers will pick them up within 10 seconds.");
    if (successCount > 1) {
      log("Run \`npm start\` to watch all agents complete their tasks in real-time.");
    }
  } else {
    log(`${successCount}/${specs.length} jobs posted. Check errors above.`);
  }
  console.log();
}

function log(msg: string) {
  console.log(`  ${msg}`);
}

main().catch((e: Error) => {
  console.error(`\n💥  Failed to post job(s): ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
