#!/usr/bin/env tsx
/**
 * Brewing — Post a research job
 * ─────────────────────────────────────────────────────────────────────────────
 * Posts a single [cap:research] job to the Brewing marketplace.
 * The worker agent (worker-agent.ts) will pick it up automatically.
 * The poster daemon (poster-daemon.ts) will auto-release payment on delivery.
 *
 * Usage:
 *   npm run post-job                           # uses the default task
 *   npm run post-job -- "Your custom task" 0.25  # custom task + payment
 *
 * Requires POSTER_SECRET_KEY in demo/.env with ≥ PAYMENT devnet USDC.
 * Get devnet USDC at https://faucet.circle.com (select Solana Devnet).
 */

import "dotenv/config";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { BrewingClient, DEVNET_USDC_MINT } from "../sdk/src/index";

// ── Defaults (override via CLI args) ─────────────────────────────────────────
const DEFAULT_TASK =
  "Summarise the key risks of a DeFi trading agent executing trades " +
  "without sentiment analysis. Structure your answer with: 1) Market " +
  "risks, 2) Technical risks, 3) Protocol risks. Be concise.";
const DEFAULT_PAYMENT = 0.10;
const CAPABILITY = "research";

// ── Parse CLI args ────────────────────────────────────────────────────────────
const [, , taskArg, paymentArg] = process.argv;
const task    = taskArg    ?? DEFAULT_TASK;
const payment = paymentArg ? parseFloat(paymentArg) : DEFAULT_PAYMENT;

if (isNaN(payment) || payment <= 0) {
  console.error("❌  Payment must be a positive number (e.g. 0.10)");
  process.exit(1);
}

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

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const RPC_URL = "https://api.devnet.solana.com";
  const conn    = new Connection(RPC_URL, "confirmed");
  const client  = new BrewingClient({ connection: conn, wallet: posterKeypair });
  const USDC    = new PublicKey(DEVNET_USDC_MINT);

  console.log();
  console.log("Posting research job to Brewing…");
  console.log(`  Capability : ${CAPABILITY}`);
  console.log(`  Payment    : ${payment.toFixed(2)} USDC`);
  console.log(`  Task       : "${task.slice(0, 80)}${task.length > 80 ? "…" : ""}"`);
  console.log();

  // Check poster USDC balance
  let posterAta;
  try {
    posterAta = await getOrCreateAssociatedTokenAccount(
      conn,
      posterKeypair,
      USDC,
      posterKeypair.publicKey
    );
  } catch (e) {
    console.error(`❌  Could not access poster USDC account: ${(e as Error).message}`);
    process.exit(1);
  }

  const balance = Number(posterAta.amount) / 1_000_000;
  console.log(`  Poster USDC balance : ${balance.toFixed(6)} USDC`);

  if (balance < payment) {
    console.error(`\n❌  Insufficient USDC. Need ${payment.toFixed(2)}, have ${balance.toFixed(6)}.`);
    console.error(`    Wallet : ${posterKeypair.publicKey.toBase58()}`);
    console.error(`    Faucet : https://faucet.circle.com  (select Solana Devnet)\n`);
    process.exit(1);
  }

  // Ensure enough SOL for the transaction
  const lamports = await conn.getBalance(posterKeypair.publicKey);
  if (lamports < 0.01 * LAMPORTS_PER_SOL) {
    console.log("  SOL balance low — requesting devnet airdrop…");
    const sig = await conn.requestAirdrop(posterKeypair.publicKey, LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
    console.log("  ✅  SOL airdrop confirmed.");
  }

  // Post the job
  const { jobId, txSig, jobAddress } = await client.postJob(task, payment, {
    capability: CAPABILITY,
  });

  console.log();
  console.log(`✅  Job #${jobId} posted successfully!`);
  console.log(`   Job account : ${jobAddress}`);
  console.log(
    `   Explorer    : https://explorer.solana.com/tx/${txSig}?cluster=devnet`
  );
  console.log();
  console.log("The worker agent will pick this up within 10 seconds.");
  console.log(
    "The poster daemon will auto-release payment when work is delivered."
  );
  console.log();
}

main().catch((e: Error) => {
  console.error(`\n💥  Failed to post job: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
