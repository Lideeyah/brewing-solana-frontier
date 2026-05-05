#!/usr/bin/env tsx
/** Emergency bulk job poster — floods the chain with jobs for demo/stats rebuild */
import dotenv from "dotenv";
dotenv.config({ override: true });
import { Connection, Keypair } from "@solana/web3.js";
import { BrewingClient } from "../sdk/src/index";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

const posterKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.POSTER_SECRET_KEY!) as number[])
);

const JOBS = [
  { capability: "research", payment: 0.10, task: "Analyse the top 3 Solana liquid staking protocols (Marinade, Jito, Sanctum). Compare APY, TVL, validator set size, and slashing risk. Produce a ranked recommendation with rationale." },
  { capability: "trading",  payment: 0.15, task: "Design a SOL/USDC momentum strategy for Drift Protocol. Specify entry signals using a 20/50 EMA crossover on 4H candles, position sizing at 2% portfolio risk, and a funding-rate filter to avoid paying negative funding." },
  { capability: "coding",   payment: 0.20, task: "Write a TypeScript function using @solana/web3.js that fetches the 10 most recent transactions for a given public key, decodes SPL token transfer instructions, and returns {mint, amount, direction, timestamp}[]." },
  { capability: "writing",  payment: 0.10, task: "Write a 200-word Twitter thread (5 tweets) announcing a new Solana DeFi protocol launch. Lead with a hook about yield, explain the core mechanism, address safety, close with CTA." },
  { capability: "research", payment: 0.10, task: "Research current Solana DeFi: identify the 5 largest protocols by TVL, dominant token pairs, and 30-day volume trends. Summarise key risks and growth catalysts." },
  { capability: "trading",  payment: 0.15, task: "Develop a mean-reversion strategy for the JitoSOL/SOL pool on Orca. Define entry/exit z-score thresholds, maximum holding period, fee drag calculation, and expected Sharpe ratio." },
  { capability: "coding",   payment: 0.20, task: "Build a TypeScript utility that calculates the optimal swap route between two SPL tokens using Jupiter's quote API. Accept input/output mints and amount, return best route with price impact and expected output." },
  { capability: "writing",  payment: 0.10, task: "Draft a 300-word technical blog post explaining how Solana proof-of-history consensus works for developers. Cover what PoH solves, how it interacts with PoS, and why it enables high throughput." },
  { capability: "research", payment: 0.10, task: "Compare yield across Solana lending protocols (Marginfi, Kamino, Drift). Current supply APY for USDC, SOL, JitoSOL with risk-adjusted rankings and TVL data." },
  { capability: "trading",  payment: 0.15, task: "Evaluate a SOL perpetual long on Drift at 2x leverage. Calculate expected value under three scenarios: bull +40%, base +10%, bear -25%. Include liquidation price and max drawdown." },
];

async function main() {
  const conn   = new Connection(RPC_URL, "confirmed");
  const client = new BrewingClient({ connection: conn, wallet: posterKeypair });

  console.log(`\nPosting ${JOBS.length} jobs to devnet…\n`);
  let posted = 0;

  for (const job of JOBS) {
    try {
      const jobId = Math.floor(Date.now() / 1000) % 99_000;
      const { jobId: id, txSig } = await client.postJob(job.task, job.payment, { capability: job.capability, jobId });
      console.log(`✅  #${id} [${job.capability}] ${job.payment.toFixed(2)} USDC posted`);
      posted++;
      await new Promise(r => setTimeout(r, 1500)); // small gap to avoid PDA collision
    } catch (e) {
      console.error(`❌  [${job.capability}] failed: ${(e as Error).message}`);
    }
  }

  console.log(`\nDone — ${posted}/${JOBS.length} jobs posted to devnet.\n`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
