export { BrewingClient } from "./client";
export type {
  BrewingClientConfig,
  Job,
  JobStatus,
  PostJobResult,
  PostJobOptions,
  ActionResult,
  SubmitWorkResult,
  WalletAdapter,
} from "./types";
export { encodeDescription, decodeDescription } from "./types";

// Re-export useful Solana types
export { Connection, Keypair, PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = "BsFiGxfJ9Spn5kp6bJoCxAwswKRskpTiPodNt8EA6QdM";
export const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
