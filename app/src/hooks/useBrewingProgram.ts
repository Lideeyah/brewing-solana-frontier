import { useMemo } from "react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import IDL from "../idl/brewing.json";

/**
 * Returns a typed Anchor Program bound to the connected wallet.
 * Returns null when no wallet is connected.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useBrewingProgram(): Program<any> | null {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Program(IDL as any, provider);
  }, [connection, wallet]);
}
