import { useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { useBrewingProgram } from "./useBrewingProgram";
import { jobPda, escrowPda } from "../utils/pdas";

// Devnet USDC mint — swap for mainnet address when ready
export const USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

/**
 * High-level hook that exposes the four core job lifecycle actions.
 * All methods return the transaction signature on success and throw on error.
 */
export function useJobActions() {
  const program = useBrewingProgram();
  const { publicKey } = useWallet();

  // Cast to any to avoid TypeScript deep-instantiation errors with Program<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methods = program ? (program as any).methods : null;

  const postJob = useCallback(
    async (jobId: number, description: string, paymentUsdc: number): Promise<string> => {
      if (!methods || !publicKey) throw new Error("Wallet not connected");
      const id = new BN(jobId);
      const [jobPubkey] = jobPda(publicKey, id);
      const [escrowPubkey] = escrowPda(publicKey, id);
      const posterAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);

      return methods
        .postJob(id, description, new BN(Math.round(paymentUsdc * 1_000_000)))
        .accounts({
          job:                jobPubkey,
          escrowTokenAccount: escrowPubkey,
          posterTokenAccount: posterAta,
          usdcMint:           USDC_MINT,
          posterAgent:        publicKey,
        })
        .rpc() as Promise<string>;
    },
    [methods, publicKey]
  );

  const acceptJob = useCallback(
    async (jobId: number, posterPubkey: PublicKey): Promise<string> => {
      if (!methods || !publicKey) throw new Error("Wallet not connected");
      const id = new BN(jobId);
      const [jobPubkey] = jobPda(posterPubkey, id);

      return methods
        .acceptJob(id)
        .accounts({
          job:         jobPubkey,
          workerAgent: publicKey,
        })
        .rpc() as Promise<string>;
    },
    [methods, publicKey]
  );

  const completeJob = useCallback(
    async (jobId: number, posterPubkey: PublicKey): Promise<string> => {
      if (!methods || !publicKey) throw new Error("Wallet not connected");
      const id = new BN(jobId);
      const [jobPubkey] = jobPda(posterPubkey, id);

      return methods
        .completeJob(id)
        .accounts({
          job:         jobPubkey,
          workerAgent: publicKey,
        })
        .rpc() as Promise<string>;
    },
    [methods, publicKey]
  );

  const releasePayment = useCallback(
    async (jobId: number, workerPubkey: PublicKey): Promise<string> => {
      if (!methods || !publicKey) throw new Error("Wallet not connected");
      const id = new BN(jobId);
      const [jobPubkey] = jobPda(publicKey, id);
      const [escrowPubkey] = escrowPda(publicKey, id);
      const workerAta = await getAssociatedTokenAddress(USDC_MINT, workerPubkey);

      return methods
        .releasePayment(id)
        .accounts({
          job:                jobPubkey,
          escrowTokenAccount: escrowPubkey,
          workerTokenAccount: workerAta,
          posterAgent:        publicKey,
        })
        .rpc() as Promise<string>;
    },
    [methods, publicKey]
  );

  return { postJob, acceptJob, completeJob, releasePayment };
}
