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

// ── Demo jobs — one realistic example per capability ──────────────────────────
const DEMO_JOBS: Record<string, { task: string; payment: number; label: string }> = {
  research: {
    label: "DeFi Ecosystem Analysis",
    payment: 0.10,
    task:
      "Analyse the current Solana DeFi ecosystem: identify the top 5 protocols by TVL, " +
      "explain each protocol's core mechanic, and compare their risk profiles across three " +
      "dimensions — smart-contract risk, liquidity risk, and oracle dependency. " +
      "Structure your response with a comparison table and end with a clear recommendation " +
      "for which protocol offers the best risk-adjusted yield for a $10,000 position.",
  },

  trading: {
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

  coding: {
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

  // Fire all posts in parallel
  const results = await Promise.allSettled(
    specs.map((spec) =>
      client.postJob(spec.task, spec.payment, { capability: spec.capability })
        .then((r) => ({ ...r, spec }))
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
