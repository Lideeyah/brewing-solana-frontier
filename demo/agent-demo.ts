#!/usr/bin/env tsx
/**
 * Brewing — End-to-End Agent Demo
 * ─────────────────────────────────────────────────────────────────────────────
 * Demonstrates the full Brewing job lifecycle on Solana Devnet:
 *
 *   Step 1 — Poster agent posts a job → 0.10 USDC locked in escrow
 *   Step 2 — Worker agent accepts the job on-chain
 *   Step 3 — Worker calls Claude claude-opus-4-7 with the job prompt → streams real AI response
 *   Step 4 — Worker submits the AI response as work output on-chain
 *   Step 5 — Poster approves and releases USDC → worker receives payment
 *
 * Every step produces a real Solana Devnet transaction. All tx signatures are
 * logged as Solana Explorer links at the end.
 *
 * ── Setup ────────────────────────────────────────────────────────────────────
 *   cp .env.example .env         # fill in POSTER_SECRET_KEY + ANTHROPIC_API_KEY
 *   cd demo && npm install
 *   npm run demo
 *
 * ── Prerequisites ────────────────────────────────────────────────────────────
 *   • POSTER_SECRET_KEY  JSON byte-array from `solana-keygen new`
 *   • Poster wallet must hold ≥ 0.10 devnet USDC
 *     → get it at https://faucet.circle.com (select Solana Devnet)
 *   • ANTHROPIC_API_KEY  from https://console.anthropic.com/settings/keys
 *   • Devnet SOL is airdropped automatically for both wallets
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
} from "@solana/spl-token";

// Import directly from the SDK source (no build step required)
import { BrewingClient, DEVNET_USDC_MINT } from "../sdk/src/index";

// ── Constants ─────────────────────────────────────────────────────────────────
const RPC_URL     = "https://api.devnet.solana.com";
const USDC_MINT   = new PublicKey(DEVNET_USDC_MINT);
const JOB_USDC    = 0.10;
const JOB_PROMPT  =
  "Summarise the key risks of a DeFi trading agent executing trades without sentiment analysis";

const explorer = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// ── Validate environment ──────────────────────────────────────────────────────
const POSTER_KEY_RAW = process.env.POSTER_SECRET_KEY;
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;

if (!POSTER_KEY_RAW) {
  console.error("\n❌  POSTER_SECRET_KEY is not set.");
  console.error(
    "    1. Run: solana-keygen new --outfile poster.json"
  );
  console.error(
    "    2. Add POSTER_SECRET_KEY=$(cat poster.json) to demo/.env"
  );
  console.error(
    "    3. Fund the wallet with devnet USDC at https://faucet.circle.com\n"
  );
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error("\n❌  ANTHROPIC_API_KEY is not set.");
  console.error(
    "    Get one at https://console.anthropic.com/settings/keys and add it to demo/.env\n"
  );
  process.exit(1);
}

// ── Parse keypair from JSON byte-array (output of solana-keygen) ──────────────
let posterKeypair: Keypair;
try {
  posterKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(POSTER_KEY_RAW) as number[])
  );
} catch {
  console.error(
    "\n❌  POSTER_SECRET_KEY is not a valid JSON byte-array (e.g. [1,2,3,...,64])."
  );
  console.error(
    "    Export it with: cat ~/.config/solana/id.json\n"
  );
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const conn      = new Connection(RPC_URL, "confirmed");
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY! });

  // Worker is a fresh wallet every run — simulates an independent agent
  const workerKeypair = Keypair.generate();

  console.log(
    "\n╔══════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║         BREWING — Live End-to-End Agent Demo (Devnet)        ║"
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝\n"
  );
  console.log(`📋  Job    : "${JOB_PROMPT}"`);
  console.log(`💰  Payment: ${JOB_USDC} USDC\n`);
  console.log(`🧑  Poster wallet : ${posterKeypair.publicKey.toBase58()}`);
  console.log(`🤖  Worker wallet : ${workerKeypair.publicKey.toBase58()}\n`);

  // ── 0a. Airdrop SOL to both wallets for transaction fees ────────────────────
  console.log("⏳  Airdropping 1 SOL to poster & worker for tx fees…");

  const [posterAirdropSig, workerAirdropSig] = await Promise.all([
    conn.requestAirdrop(posterKeypair.publicKey, LAMPORTS_PER_SOL),
    conn.requestAirdrop(workerKeypair.publicKey, LAMPORTS_PER_SOL),
  ]);

  await Promise.all([
    conn.confirmTransaction(posterAirdropSig, "confirmed"),
    conn.confirmTransaction(workerAirdropSig, "confirmed"),
  ]);
  console.log("✅  SOL airdrops confirmed.\n");

  // ── 0b. Create worker USDC token account ────────────────────────────────────
  // This must exist before release_payment can transfer USDC to the worker.
  console.log("⏳  Creating worker USDC token account…");
  const workerAtaInfo = await getOrCreateAssociatedTokenAccount(
    conn,
    workerKeypair,          // payer — worker pays for its own account
    USDC_MINT,
    workerKeypair.publicKey
  );
  console.log(`✅  Worker USDC ATA : ${workerAtaInfo.address.toBase58()}\n`);

  // ── 0c. Check poster USDC balance ───────────────────────────────────────────
  console.log("⏳  Checking poster USDC balance…");
  const posterAtaInfo = await getOrCreateAssociatedTokenAccount(
    conn,
    posterKeypair,
    USDC_MINT,
    posterKeypair.publicKey
  );
  const posterBalance = Number(posterAtaInfo.amount) / 1_000_000;
  console.log(`💵  Poster USDC balance : ${posterBalance.toFixed(6)} USDC`);

  if (posterBalance < JOB_USDC) {
    console.error(`\n❌  Poster needs ≥ ${JOB_USDC} USDC to post this job.`);
    console.error(`    Current balance : ${posterBalance.toFixed(6)} USDC`);
    console.error(`    Wallet address  : ${posterKeypair.publicKey.toBase58()}`);
    console.error(
      `    Get devnet USDC at https://faucet.circle.com (select Solana Devnet)\n`
    );
    process.exit(1);
  }
  console.log("✅  Sufficient USDC.\n");

  // ── Build BrewingClient instances ───────────────────────────────────────────
  const posterClient = new BrewingClient({ connection: conn, wallet: posterKeypair });
  const workerClient = new BrewingClient({ connection: conn, wallet: workerKeypair });

  // Collect all tx sigs for the summary table
  const txSigs: Record<string, string> = {};

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1 — Poster posts job → USDC locked in escrow
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log("──────────────────────────────────────────────────────────────");
  console.log("STEP 1 — Poster posting job + locking USDC in escrow…");

  const { jobId, txSig: postTxSig, jobAddress } =
    await posterClient.postJob(JOB_PROMPT, JOB_USDC);
  txSigs.postJob = postTxSig;

  console.log(`✅  Job #${jobId} posted`);
  console.log(`   Job account : ${jobAddress}`);
  console.log(`   Tx          : ${explorer(postTxSig)}\n`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2 — Worker accepts the job on-chain
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log("──────────────────────────────────────────────────────────────");
  console.log("STEP 2 — Worker accepting the job…");

  const { txSig: acceptTxSig } = await workerClient.acceptJob(jobId);
  txSigs.acceptJob = acceptTxSig;

  console.log(`✅  Job #${jobId} accepted — status: InProgress`);
  console.log(`   Tx : ${explorer(acceptTxSig)}\n`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 3 — Worker calls Claude claude-opus-4-7 API with the job prompt
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log("──────────────────────────────────────────────────────────────");
  console.log("STEP 3 — Worker calling Claude claude-opus-4-7 API…");
  console.log(`   Model  : claude-opus-4-7  (adaptive thinking)`);
  console.log(`   Prompt : "${JOB_PROMPT}"\n`);
  console.log("   ── Response ───────────────────────────────────────────────");
  console.log();

  let workOutput = "";

  // Stream the response to console in real-time
  const stream = anthropic.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thinking: { type: "adaptive" } as any,
    messages: [
      { role: "user", content: JOB_PROMPT },
    ],
  });

  stream.on("text", (chunk) => {
    process.stdout.write(chunk);
    workOutput += chunk;
  });

  await stream.finalMessage();

  console.log("\n");
  console.log("   ────────────────────────────────────────────────────────────");
  console.log(`\n✅  AI response received (${workOutput.length} chars)\n`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 4 — Worker submits the AI response as work output on-chain
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log("──────────────────────────────────────────────────────────────");
  console.log("STEP 4 — Worker submitting work on-chain…");

  const submitResult = await workerClient.submitWork(jobId, workOutput);
  txSigs.submitWork = submitResult.completeTxSig;

  console.log(`✅  Work submitted — job status: PendingRelease`);
  console.log(`   Tx : ${explorer(submitResult.completeTxSig)}\n`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 5 — Poster approves work → USDC released to worker
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log("──────────────────────────────────────────────────────────────");
  console.log("STEP 5 — Poster releasing USDC payment to worker…");

  const { txSig: releaseTxSig } = await posterClient.releasePayment(jobId);
  txSigs.releasePayment = releaseTxSig;

  console.log(`✅  USDC released — job status: Completed`);
  console.log(`   Tx : ${explorer(releaseTxSig)}\n`);

  // ── Verify final balances ──────────────────────────────────────────────────
  const [workerAccountFinal, posterAccountFinal] = await Promise.all([
    getAccount(conn, workerAtaInfo.address),
    getAccount(conn, posterAtaInfo.address),
  ]);
  const workerFinalUsdc = Number(workerAccountFinal.amount) / 1_000_000;
  const posterFinalUsdc = Number(posterAccountFinal.amount) / 1_000_000;

  console.log("──────────────────────────────────────────────────────────────");
  console.log("Final USDC balances:");
  console.log(`   🧑  Poster : ${posterFinalUsdc.toFixed(6)} USDC  (was ${posterBalance.toFixed(6)})`);
  console.log(`   🤖  Worker : ${workerFinalUsdc.toFixed(6)} USDC  (was 0.000000)\n`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(
    "╔══════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║                   DEMO COMPLETE ✅                           ║"
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝\n"
  );
  console.log(`  Job #${jobId}  —  ${JOB_USDC} USDC  —  Completed on Devnet\n`);
  console.log("  Transactions (click to verify on Solana Explorer):");
  console.log(`  1. Post job     ${explorer(txSigs.postJob)}`);
  console.log(`  2. Accept job   ${explorer(txSigs.acceptJob)}`);
  console.log(`  3. Submit work  ${explorer(txSigs.submitWork)}`);
  console.log(`  4. Release pay  ${explorer(txSigs.releasePayment)}\n`);
}

main().catch((err: Error) => {
  console.error("\n💥  Demo failed:", err.message ?? err);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
