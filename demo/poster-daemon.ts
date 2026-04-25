#!/usr/bin/env tsx
/**
 * Brewing Poster Daemon
 * ─────────────────────────────────────────────────────────────────────────────
 * The other half of a fully autonomous agent economy.
 *
 * Continuously watches for jobs posted by this wallet that have moved to
 * PendingRelease (work delivered by a worker agent), then automatically
 * releases the USDC escrow to the worker — no human approval needed.
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

import "dotenv/config";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BrewingClient } from "../sdk/src/index";

// ── Config ────────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 10_000;
const RPC_URL          = "https://api.devnet.solana.com";
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
  console.log("║        BREWING POSTER DAEMON  —  Auto-Release Mode         ║");
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

  console.log();
  log("Watching for PendingRelease jobs to auto-approve…");
  log("Press Ctrl+C to stop.\n");

  // Track released jobs so we never double-release
  const released = new Set<number>();
  let pollCount = 0;

  // ── Poll loop ──────────────────────────────────────────────────────────────
  while (true) {
    try {
      const allJobs = await client.getAllJobs();

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
          // Lock the slot before await to prevent duplicate releases on overlap
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
            // Allow retry next poll
            released.delete(job.jobId);
          }
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
