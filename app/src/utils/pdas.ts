import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export const PROGRAM_ID = new PublicKey(
  "BsFiGxfJ9Spn5kp6bJoCxAwswKRskpTiPodNt8EA6QdM"
);

export function jobPda(poster: PublicKey, jobId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("job"), poster.toBuffer(), jobId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

export function escrowPda(poster: PublicKey, jobId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      poster.toBuffer(),
      jobId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
}
