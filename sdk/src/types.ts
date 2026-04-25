import type { Connection, PublicKey as SolanaPublicKey } from "@solana/web3.js";
import type { Keypair } from "@solana/web3.js";

export type JobStatus =
  | "Open"
  | "InProgress"
  | "PendingRelease"
  | "Completed"
  | "Disputed"
  | "Cancelled";

export interface Job {
  jobId: number;
  /** Raw on-chain description string (may include a [cap:X] prefix) */
  description: string;
  /**
   * Parsed capability tag — e.g. "research", "coding", "analysis".
   * Undefined if the job was posted without a capability tag.
   */
  capability?: string;
  /**
   * The task the worker must complete — description with the [cap:X] prefix
   * stripped. Falls back to the full description for legacy jobs.
   */
  task: string;
  /** Payment in USDC (human-readable, not microUSDC) */
  paymentAmount: number;
  posterAgent: string;
  workerAgent: string | null;
  status: JobStatus;
  /**
   * Claude verification score (1-10). 0 means unverified (Open/InProgress).
   * ≥ 7 → payment released automatically. < 7 → status is Disputed.
   */
  verificationScore: number;
  /** On-chain PDA address of the job account */
  address: string;
}

export interface PostJobResult {
  jobId: number;
  txSig: string;
  jobAddress: string;
}

export interface ActionResult {
  txSig: string;
}

export interface SubmitWorkResult {
  /** tx sig of the complete_job call */
  completeTxSig: string;
  /** tx sig of the release_payment call — set when poster === worker wallet (auto-release) */
  releaseTxSig?: string;
  /** Whether payment was automatically released */
  autoReleased: boolean;
  /** Verification score recorded on-chain */
  verificationScore: number;
}

export interface DisputeJobResult {
  txSig: string;
  verificationScore: number;
}

export interface ReclaimEscrowResult {
  txSig: string;
  amount: number;
}

/** Minimal wallet interface — satisfied by both AnchorWallet and any Keypair-based adapter */
export interface WalletAdapter {
  publicKey: SolanaPublicKey;
  signTransaction: <T extends import("@solana/web3.js").Transaction | import("@solana/web3.js").VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends import("@solana/web3.js").Transaction | import("@solana/web3.js").VersionedTransaction>(txs: T[]) => Promise<T[]>;
}

export interface BrewingClientConfig {
  connection: Connection;
  /** Either a Keypair (for AI agents running server-side) or a wallet adapter (for browser) */
  wallet: Keypair | WalletAdapter;
  /** Override USDC mint address (defaults to devnet USDC) */
  usdcMint?: SolanaPublicKey;
}

export interface PostJobOptions {
  /** Explicit job ID — auto-generated from timestamp if omitted */
  jobId?: number;
  /**
   * Capability tag that declares what type of agent can handle this job.
   * e.g. "research", "coding", "analysis", "trading"
   * Encoded into the on-chain description as a [cap:X] prefix.
   */
  capability?: string;
}

// ── Capability encoding helpers ───────────────────────────────────────────────

const CAP_PREFIX = /^\[cap:([^\]]+)\]\s*/;

/**
 * Encode a capability tag into a job description string.
 */
export function encodeDescription(task: string, capability?: string): string {
  if (!capability) return task;
  return `[cap:${capability}] ${task}`;
}

/**
 * Decode a capability tag from a raw on-chain description.
 */
export function decodeDescription(raw: string): { capability?: string; task: string } {
  const match = raw.match(CAP_PREFIX);
  if (match) {
    return { capability: match[1], task: raw.replace(CAP_PREFIX, "") };
  }
  return { task: raw };
}
