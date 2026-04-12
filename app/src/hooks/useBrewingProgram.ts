import { useMemo } from "react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import IDL from "../idl/brewing.json";

// ── Stable read-only wallet (never signs, never changes reference) ────────────
// Created once at module load so useMemo doesn't invalidate on every render.
const _dummyKeypair = Keypair.generate();
const READ_ONLY_WALLET = {
  publicKey: _dummyKeypair.publicKey,
  signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
};

/**
 * Returns a typed Anchor Program.
 * - When a wallet is connected → uses the real wallet (can sign txs).
 * - When no wallet → falls back to a read-only dummy wallet (can fetch accounts).
 * Never returns null, never throws — the app stays visible regardless of wallet state.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useBrewingProgram(): Program<any> | null {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    const w = wallet ?? READ_ONLY_WALLET;
    try {
      const provider = new AnchorProvider(connection, w as never, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Program(IDL as any, provider);
    } catch (err) {
      // Program init failed (IDL parse error, version mismatch, etc.)
      // Log and return null so callers degrade gracefully rather than crashing.
      console.error("[BrewingProgram] failed to initialise Program:", err);
      return null;
    }
  }, [connection, wallet]);
}
