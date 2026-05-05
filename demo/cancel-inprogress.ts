/**
 * cancel-inprogress.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cancels all InProgress jobs owned by this worker/poster pair.
 *   1. Worker disputes each InProgress job (score 0 — no Claude needed)
 *   2. Poster reclaims escrow (USDC returned, status → Cancelled)
 *
 * Run once: npx tsx demo/cancel-inprogress.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: "demo/.env", override: true });

import { Connection, Keypair } from "@solana/web3.js";
import { BrewingClient } from "../sdk/src/index";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

const workerKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.WORKER_SECRET_KEY!) as number[])
);
const posterKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.POSTER_SECRET_KEY!) as number[])
);

const ts  = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (msg: string) => console.log(`[${ts()}]  ${msg}`);
const err = (msg: string) => console.error(`[${ts()}]  ❌ ${msg}`);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const conn         = new Connection(RPC_URL, "confirmed");
  const workerClient = new BrewingClient({ connection: conn, wallet: workerKeypair });
  const posterClient = new BrewingClient({ connection: conn, wallet: posterKeypair });

  log("Fetching all jobs…");
  const allJobs = await workerClient.getAllJobs();

  const stuck = allJobs.filter(j => j.status === "InProgress");
  log(`Found ${stuck.length} InProgress jobs to cancel.`);

  if (stuck.length === 0) { log("Nothing to do."); return; }

  let cancelled = 0;
  let failed    = 0;

  for (let i = 0; i < stuck.length; i++) {
    const job = stuck[i];
    log(`[${i + 1}/${stuck.length}]  #${job.jobId}  [${job.capability}]  ${job.paymentAmount.toFixed(2)} USDC`);

    // Step 1 — Worker disputes (score 0, no Claude)
    try {
      const { txSig } = await workerClient.disputeJob(job.jobId, 0);
      log(`  ✓ Disputed   tx: ${txSig.slice(0, 20)}…`);
    } catch (e) {
      err(`  Dispute failed: ${(e as Error).message.slice(0, 80)}`);
      failed++;
      await sleep(1_000);
      continue;
    }

    await sleep(800);

    // Step 2 — Poster reclaims escrow (USDC back, status → Cancelled)
    try {
      const { txSig } = await posterClient.reclaimEscrow(job.jobId);
      log(`  ✓ Reclaimed  tx: ${txSig.slice(0, 20)}…`);
      cancelled++;
    } catch (e) {
      err(`  Reclaim failed: ${(e as Error).message.slice(0, 80)}`);
      failed++;
    }

    // Pause between jobs to stay within RPC rate limits
    await sleep(1_200);
  }

  log("─".repeat(60));
  log(`Done. Cancelled: ${cancelled}  Failed: ${failed}`);
  log(`USDC returned to poster wallet: ${posterKeypair.publicKey.toBase58()}`);
}

main().catch(e => {
  console.error("Script crashed:", e.message);
  process.exit(1);
});
