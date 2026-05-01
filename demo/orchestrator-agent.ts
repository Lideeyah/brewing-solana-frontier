#!/usr/bin/env tsx
/**
 * Brewing Orchestrator Agent
 * ─────────────────────────────────────────────────────────────────────────────
 * Takes a high-level business goal, breaks it into specialist sub-tasks using
 * Claude, posts each as a real Brewing job on-chain, waits for all to complete,
 * then synthesises a final deliverable.
 *
 * This demonstrates the "business owner" use case: deploy one orchestrator and
 * it assembles a team, pays them in USDC, and delivers the result.
 *
 * Usage:
 *   npm run orchestrate
 *   npm run orchestrate -- "Research Solana DeFi, build a portfolio tracker, and write a pitch deck"
 *   npm run orchestrate -- "Analyse SOL momentum, code a trading bot, and draft a launch thread"
 */

import dotenv from "dotenv";
dotenv.config({ override: true });
import Anthropic from "@anthropic-ai/sdk";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BrewingClient } from "../sdk/src/index";

// ── Config ────────────────────────────────────────────────────────────────────
const RPC_URL        = "https://api.devnet.solana.com";
const POLL_MS        = 15_000;
const MAX_WAIT_MS    = 10 * 60 * 1_000; // 10 min timeout per sub-task
const EXPLORER_TX    = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

const CAPABILITY_MAP: Record<string, { payment: number; desc: string }> = {
  research: { payment: 0.10, desc: "Analysis, research, data synthesis" },
  trading:  { payment: 0.15, desc: "Market strategy, price analysis" },
  coding:   { payment: 0.20, desc: "TypeScript code generation" },
  writing:  { payment: 0.10, desc: "Copywriting, content, documentation" },
};

// ── Validate env ──────────────────────────────────────────────────────────────
if (!process.env.POSTER_SECRET_KEY) {
  console.error("❌  POSTER_SECRET_KEY not set. See demo/.env.example");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌  ANTHROPIC_API_KEY not set.");
  process.exit(1);
}

const posterKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.POSTER_SECRET_KEY) as number[])
);

// ── Logger ────────────────────────────────────────────────────────────────────
const ts  = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (msg: string) => console.log(`[${ts()}]  ${msg}`);
const err = (msg: string) => console.error(`[${ts()}]  ❌ ${msg}`);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Types ─────────────────────────────────────────────────────────────────────
interface SubTask {
  capability: keyof typeof CAPABILITY_MAP;
  task: string;
  rationale: string;
}

interface PostedSubTask extends SubTask {
  jobId: number;
  txSig: string;
  result?: string;
  verificationScore?: number;
}

// ── Step 1: Decompose goal into sub-tasks using Claude ────────────────────────
async function decomposeGoal(anthropic: Anthropic, goal: string): Promise<SubTask[]> {
  log("🧠  Decomposing goal into sub-tasks…");

  const response = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `You are an orchestrator agent on the Brewing marketplace — a decentralised job board where AI agents hire specialist agents and pay them in USDC on Solana.

Your goal: "${goal}"

Break this into 2–4 concrete sub-tasks that can be delegated to specialist agents. Each sub-task must map to exactly one capability type: research, trading, coding, or writing.

Reply with ONLY valid JSON — no markdown, no explanation:
{
  "subtasks": [
    {
      "capability": "research|trading|coding|writing",
      "task": "Detailed task description for the specialist agent (100-300 words). Be specific about deliverables.",
      "rationale": "One sentence: why this capability handles this piece."
    }
  ]
}`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = JSON.parse(text) as { subtasks: SubTask[] };
  return parsed.subtasks;
}

// ── Step 2: Post all sub-tasks as real Brewing jobs ───────────────────────────
async function postSubTasks(
  client: BrewingClient,
  subTasks: SubTask[]
): Promise<PostedSubTask[]> {
  const posted: PostedSubTask[] = [];
  for (const sub of subTasks) {
    const cfg = CAPABILITY_MAP[sub.capability];
    log(`📬  Posting [${sub.capability}] job — ${cfg.payment} USDC`);
    log(`    "${sub.task.slice(0, 80)}…"`);
    try {
      const jobId = Math.floor(Date.now() / 1000) % 99_000;
      const { jobId: confirmedId, txSig } = await client.postJob(
        sub.task, cfg.payment, { capability: sub.capability, jobId }
      );
      log(`✅  Job #${confirmedId} posted — ${EXPLORER_TX(txSig)}`);
      posted.push({ ...sub, jobId: confirmedId, txSig });
      await sleep(2_000); // avoid rapid PDA collisions
    } catch (e) {
      err(`Failed to post [${sub.capability}]: ${(e as Error).message}`);
    }
  }
  return posted;
}

// ── Step 3: Poll until all sub-tasks complete ─────────────────────────────────
async function waitForCompletion(
  client: BrewingClient,
  tasks: PostedSubTask[]
): Promise<PostedSubTask[]> {
  const pending = new Set(tasks.map(t => t.jobId));
  const results = new Map<number, PostedSubTask>(tasks.map(t => [t.jobId, t]));
  const startedAt = Date.now();

  log(`\n⏳  Waiting for ${pending.size} sub-task(s) to complete…`);
  log("    Workers are processing in parallel.\n");

  while (pending.size > 0) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      err(`Timeout — ${pending.size} job(s) still pending: [${[...pending].join(", ")}]`);
      break;
    }

    await sleep(POLL_MS);
    const allJobs = await client.getAllJobs();

    for (const jobId of [...pending]) {
      const job = allJobs.find(j => j.jobId === jobId);
      if (!job) continue;

      const current = results.get(jobId)!;

      if (job.status === "Completed") {
        log(`✅  #${jobId} [${current.capability}] — Completed (score: ${job.verificationScore}/10)`);
        results.set(jobId, {
          ...current,
          result: job.task, // task field holds the final description/output context
          verificationScore: job.verificationScore,
        });
        pending.delete(jobId);
      } else if (job.status === "Disputed") {
        log(`⚠️  #${jobId} [${current.capability}] — Disputed (score: ${job.verificationScore}/10), skipping`);
        pending.delete(jobId);
      } else if (job.status === "Cancelled") {
        log(`↩  #${jobId} [${current.capability}] — Cancelled`);
        pending.delete(jobId);
      } else {
        log(`⏳  #${jobId} [${current.capability}] — ${job.status}`);
      }
    }
  }

  return [...results.values()];
}

// ── Step 4: Synthesise final deliverable using Claude ─────────────────────────
async function synthesise(
  anthropic: Anthropic,
  goal: string,
  completedTasks: PostedSubTask[]
): Promise<string> {
  log("\n🔬  Synthesising final deliverable…");

  const completed = completedTasks.filter(t => t.verificationScore && t.verificationScore >= 7);
  if (completed.length === 0) {
    return "No sub-tasks completed with sufficient quality to synthesise a result.";
  }

  const taskSummaries = completedTasks
    .map(t => `[${t.capability.toUpperCase()}] Job #${t.jobId} (score: ${t.verificationScore ?? "N/A"}/10)\nTask: ${t.task.slice(0, 200)}\nStatus: ${t.verificationScore && t.verificationScore >= 7 ? "Completed" : "Disputed/Failed"}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    messages: [{
      role: "user",
      content: `You are an orchestrator agent on the Brewing decentralised AI marketplace.

ORIGINAL GOAL:
"${goal}"

COMPLETED SUB-TASKS:
${taskSummaries}

Write a concise executive summary (300–500 words) that:
1. Confirms each completed sub-task and its quality score
2. Synthesises the key findings/outputs into a coherent narrative
3. Highlights what was achieved end-to-end
4. Notes any sub-tasks that failed or were disputed

This is the final deliverable for the business owner who deployed this orchestrator.`,
    }],
  });

  return response.content
    .filter(b => b.type === "text")
    .map(b => b.type === "text" ? b.text : "")
    .join("");
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const goal = process.argv[2] ??
    "Research the top 3 Solana DeFi yield opportunities, then write a 200-word investor summary of the best option";

  const conn      = new Connection(RPC_URL, "confirmed");
  const client    = new BrewingClient({ connection: conn, wallet: posterKeypair });
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  console.log();
  console.log("╔═════════════════════════════════════════════════════════════════╗");
  console.log("║         BREWING ORCHESTRATOR  —  Autonomous Multi-Agent        ║");
  console.log("╚═════════════════════════════════════════════════════════════════╝");
  console.log();
  log(`Poster  : ${posterKeypair.publicKey.toBase58()}`);
  log(`Goal    : "${goal}"`);
  console.log();

  // Check SOL
  const lamports = await conn.getBalance(posterKeypair.publicKey);
  log(`SOL     : ${(lamports / LAMPORTS_PER_SOL).toFixed(4)}`);
  if (lamports < 0.05 * LAMPORTS_PER_SOL) {
    err("SOL balance low — fund at https://faucet.solana.com");
  }

  // ── 1. Decompose ──────────────────────────────────────────────────────────
  const subTasks = await decomposeGoal(anthropic, goal);
  console.log();
  log(`📋  ${subTasks.length} sub-task(s) identified:`);
  subTasks.forEach((t, i) => {
    log(`    ${i + 1}. [${t.capability}] ${t.rationale}`);
  });

  // ── 2. Post jobs ──────────────────────────────────────────────────────────
  console.log();
  const posted = await postSubTasks(client, subTasks);
  if (posted.length === 0) {
    err("No sub-tasks posted — aborting.");
    process.exit(1);
  }

  const totalUsdc = posted.reduce((s, t) => s + CAPABILITY_MAP[t.capability].payment, 0);
  log(`\n💰  Total escrowed: ${totalUsdc.toFixed(2)} USDC across ${posted.length} job(s)`);

  // ── 3. Wait for completion ────────────────────────────────────────────────
  const results = await waitForCompletion(client, posted);

  // ── 4. Synthesise ─────────────────────────────────────────────────────────
  const summary = await synthesise(anthropic, goal, results);

  console.log();
  console.log("═══════════════════════ ORCHESTRATOR RESULT ═══════════════════════");
  console.log();
  console.log(summary);
  console.log();
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log();

  const completed = results.filter(t => t.verificationScore && t.verificationScore >= 7).length;
  log(`✅  Done — ${completed}/${results.length} sub-tasks completed`);
  log(`    Total spent: ${totalUsdc.toFixed(2)} USDC`);
}

main().catch((e: Error) => {
  console.error(`\n💥  Orchestrator crashed: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
