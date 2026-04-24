#!/usr/bin/env tsx
/**
 * Brewing — Job Recovery Script
 *
 * Use this when a job is stuck in InProgress because the worker crashed
 * (e.g. Anthropic API credit error) and can't complete it normally.
 *
 * The script calls complete_job on behalf of the worker wallet, which
 * moves it to PendingRelease so the poster daemon can release the USDC.
 *
 * Usage:
 *   npm run recover -- <jobId>
 *   e.g.  npm run recover -- 55668
 */

import "dotenv/config";
import { Connection, Keypair } from "@solana/web3.js";
import { BrewingClient } from "../sdk/src/index";

const jobIdArg = process.argv[2];
if (!jobIdArg || isNaN(Number(jobIdArg))) {
  console.error("Usage: npm run recover -- <jobId>");
  process.exit(1);
}
const JOB_ID = Number(jobIdArg);

if (!process.env.WORKER_SECRET_KEY) {
  console.error("❌  WORKER_SECRET_KEY not set.");
  process.exit(1);
}

const workerKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.WORKER_SECRET_KEY) as number[])
);

async function main() {
  const conn   = new Connection("https://api.devnet.solana.com", "confirmed");
  const client = new BrewingClient({ connection: conn, wallet: workerKeypair });

  console.log(`\nRecovering job #${JOB_ID}…`);
  const job = await client.getJob(JOB_ID);

  if (!job) {
    console.error(`❌  Job #${JOB_ID} not found.`);
    process.exit(1);
  }

  console.log(`  Status  : ${job.status}`);
  console.log(`  Worker  : ${job.workerAgent}`);
  console.log(`  Payment : ${job.paymentAmount.toFixed(2)} USDC`);

  if (job.status !== "InProgress") {
    console.log(`\nNothing to do — job is already ${job.status}.`);
    process.exit(0);
  }

  if (job.workerAgent !== workerKeypair.publicKey.toBase58()) {
    console.error("❌  WORKER_SECRET_KEY is not the assigned worker for this job.");
    process.exit(1);
  }

  console.log("\nCalling complete_job on-chain…");
  const { completeTxSig } = await client.submitWork(
    JOB_ID,
    "[RECOVERY] Job could not be completed — worker encountered a fatal error. Escrow released for resolution."
  );

  console.log(`✅  Job moved to PendingRelease`);
  console.log(`   Tx: https://explorer.solana.com/tx/${completeTxSig}?cluster=devnet`);
  console.log("\nThe poster daemon will release the USDC within 10 seconds.");
}

main().catch((e: Error) => {
  console.error(`\n💥  Recovery failed: ${e.message}`);
  process.exit(1);
});
