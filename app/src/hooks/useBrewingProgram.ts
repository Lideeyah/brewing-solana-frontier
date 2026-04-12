import { useMemo } from "react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { type Brewing } from "../idl/brewing";
import IDL from "../idl/brewing.json";
import { PROGRAM_ID } from "../utils/pdas";

/**
 * Returns a typed Anchor `Program<Brewing>` bound to the connected wallet.
 * Returns `null` when no wallet is connected.
 */
export function useBrewingProgram(): Program<Brewing> | null {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    return new Program<Brewing>(IDL as Brewing, provider);
  }, [connection, wallet]);
}
