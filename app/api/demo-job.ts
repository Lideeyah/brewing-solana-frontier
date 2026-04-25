/**
 * POST /api/demo-job
 * ─────────────────────────────────────────────────────────────────────────────
 * Posts a randomly selected demo job on-chain using the server-side poster
 * keypair, so the "Run Demo" button in the dashboard shows a real pipeline
 * rather than a mock animation.
 *
 * Requires POSTER_SECRET_KEY in Vercel environment variables.
 * Returns { jobId, txSig, task, capability, payment, poster }.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Connection, Keypair } from "@solana/web3.js";
import { BrewingClient } from "brewing-sdk";

// ── Varied task pool — rotated randomly each demo ─────────────────────────────
const DEMO_TASKS = [
  {
    capability: "research",
    payment: 0.10,
    label: "Solana DeFi Ecosystem",
    task:
      "Analyse the current Solana DeFi ecosystem: identify the top 5 protocols by TVL, " +
      "explain each protocol's core mechanic, and compare their risk profiles across " +
      "smart-contract risk, liquidity risk, and oracle dependency. Include a comparison " +
      "table and end with a clear recommendation for the best risk-adjusted yield on a $10,000 position.",
  },
  {
    capability: "research",
    payment: 0.10,
    label: "AI Agent Infrastructure on Solana",
    task:
      "Research the current state of AI agent infrastructure on Solana. Identify the top 5 " +
      "protocols enabling autonomous agent-to-agent interactions: explain their mechanisms, " +
      "token economics, and traction metrics. Compare them on programmability, latency, and " +
      "cost. Conclude with which stack you'd recommend for a new agent marketplace.",
  },
  {
    capability: "trading",
    payment: 0.15,
    label: "SOL/USDC Momentum Strategy",
    task:
      "Design a SOL/USDC momentum strategy for Drift Protocol. Specify: " +
      "(1) entry signals using a 20/50 EMA crossover on 4H candles, " +
      "(2) position sizing at 2% portfolio risk per trade with ATR-based stops, " +
      "(3) a funding-rate filter to avoid paying negative funding on longs, " +
      "(4) estimated Sharpe ratio and monthly win rate given SOL's historical volatility. " +
      "Walk through one concrete example trade end-to-end.",
  },
  {
    capability: "trading",
    payment: 0.15,
    label: "Delta-Neutral Yield on Drift",
    task:
      "Design a delta-neutral yield strategy using SOL-PERP on Drift Protocol. " +
      "Specify: borrow SOL spot, sell equivalent SOL-PERP to hedge delta, earn funding rate. " +
      "Quantify: expected APY at current average funding rates, liquidation risk thresholds, " +
      "max recommended position size relative to open interest, and slippage cost model. " +
      "Include a step-by-step execution plan.",
  },
  {
    capability: "coding",
    payment: 0.20,
    label: "Solana Wallet Monitor Class",
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
    capability: "coding",
    payment: 0.20,
    label: "SPL Token Portfolio Fetcher",
    task:
      "Write a TypeScript function fetchPortfolio(walletAddress: string) for Solana that: " +
      "(1) fetches all SPL token balances for the wallet using getTokenAccountsByOwner, " +
      "(2) resolves USD prices for each token using the Jupiter Price API v2, " +
      "(3) returns a typed Portfolio object with total USD value and per-token breakdown, " +
      "(4) handles missing prices gracefully with a null sentinel. " +
      "Include strict types, retry logic with exponential backoff, and a usage example.",
  },
];

const RPC_URL = "https://api.devnet.solana.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const keyStr = process.env.POSTER_SECRET_KEY;
  if (!keyStr) {
    return res.status(500).json({ error: "POSTER_SECRET_KEY not configured on server" });
  }

  let keypair: Keypair;
  try {
    keypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(keyStr) as number[])
    );
  } catch {
    return res.status(500).json({ error: "Invalid POSTER_SECRET_KEY format" });
  }

  // Pick a random task from the pool
  const job = DEMO_TASKS[Math.floor(Math.random() * DEMO_TASKS.length)];

  try {
    const conn   = new Connection(RPC_URL, "confirmed");
    const client = new BrewingClient({ connection: conn, wallet: keypair });

    // Use a timestamp-based ID, mod to keep it reasonable
    const jobId = Math.floor(Date.now() / 1000) % 99_000;

    const result = await client.postJob(job.task, job.payment, {
      capability: job.capability,
      jobId,
    });

    res.status(200).json({
      jobId:      result.jobId,
      txSig:      result.txSig,
      task:       job.task,
      label:      job.label,
      capability: job.capability,
      payment:    job.payment,
      poster:     keypair.publicKey.toBase58(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
}
