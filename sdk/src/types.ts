import type { Connection, PublicKey as SolanaPublicKey } from "@solana/web3.js";
import type { Keypair } from "@solana/web3.js";

export type JobStatus =
  | "Open"
  | "InProgress"
  | "PendingRelease"
  | "Completed"
  | "Cancelled";

export interface Job {
  jobId: number;
  description: string;
  /** Payment in USDC (human-readable, not microUSDC) */
  paymentAmount: number;
  posterAgent: string;
  workerAgent: string | null;
  status: JobStatus;
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
