import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Brewing } from "../target/types/brewing";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function airdrop(
  provider: anchor.AnchorProvider,
  pubkey: PublicKey,
  sol = 2
) {
  const sig = await provider.connection.requestAirdrop(
    pubkey,
    sol * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(sig, "confirmed");
}

function jobPda(
  programId: PublicKey,
  poster: PublicKey,
  jobId: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("job"), poster.toBuffer(), jobId.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

function escrowPda(
  programId: PublicKey,
  poster: PublicKey,
  jobId: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      poster.toBuffer(),
      jobId.toArrayLike(Buffer, "le", 8),
    ],
    programId
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("brewing", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Brewing as Program<Brewing>;

  let usdcMint: PublicKey;
  const posterAgent = Keypair.generate();
  const workerAgent = Keypair.generate();
  let posterAta: PublicKey;
  let workerAta: PublicKey;
  const jobId = new BN(1);
  const paymentAmount = new BN(1_000_000); // 1 USDC (6 decimals)

  before("setup wallets + mint", async () => {
    await Promise.all([
      airdrop(provider, posterAgent.publicKey),
      airdrop(provider, workerAgent.publicKey),
      airdrop(provider, provider.wallet.publicKey),
    ]);

    // Create a localnet USDC mock mint
    usdcMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      provider.wallet.publicKey, // mint authority
      null,
      6
    );

    // Create ATAs and fund poster with 10 USDC
    posterAta = await createAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      posterAgent.publicKey
    );
    workerAta = await createAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      workerAgent.publicKey
    );

    await mintTo(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      posterAta,
      provider.wallet.publicKey,
      10_000_000 // 10 USDC
    );
  });

  it("post_job: creates job account and locks USDC in escrow", async () => {
    const [jobPubkey] = jobPda(program.programId, posterAgent.publicKey, jobId);
    const [escrowPubkey] = escrowPda(
      program.programId,
      posterAgent.publicKey,
      jobId
    );

    await program.methods
      .postJob(jobId, "Summarise this research paper for me", paymentAmount)
      .accounts({
        job: jobPubkey,
        escrowTokenAccount: escrowPubkey,
        posterTokenAccount: posterAta,
        usdcMint,
        posterAgent: posterAgent.publicKey,
      })
      .signers([posterAgent])
      .rpc();

    const jobAccount = await program.account.jobAccount.fetch(jobPubkey);
    assert.ok(jobAccount.jobId.eq(jobId), "job_id mismatch");
    assert.equal(
      jobAccount.description,
      "Summarise this research paper for me"
    );
    assert.ok(jobAccount.paymentAmount.eq(paymentAmount), "payment mismatch");
    assert.equal(
      jobAccount.posterAgent.toBase58(),
      posterAgent.publicKey.toBase58()
    );
    assert.equal(jobAccount.status, { open: {} } as unknown as number);

    const escrow = await getAccount(provider.connection, escrowPubkey);
    assert.equal(Number(escrow.amount), paymentAmount.toNumber());
  });

  it("accept_job: worker locks in and status moves to InProgress", async () => {
    const [jobPubkey] = jobPda(program.programId, posterAgent.publicKey, jobId);

    await program.methods
      .acceptJob(jobId)
      .accounts({
        job: jobPubkey,
        workerAgent: workerAgent.publicKey,
      })
      .signers([workerAgent])
      .rpc();

    const jobAccount = await program.account.jobAccount.fetch(jobPubkey);
    assert.equal(
      jobAccount.workerAgent.toBase58(),
      workerAgent.publicKey.toBase58()
    );
    assert.equal(
      jobAccount.status,
      { inProgress: {} } as unknown as number
    );
  });

  it("complete_job: worker signals delivery, status moves to PendingRelease", async () => {
    const [jobPubkey] = jobPda(program.programId, posterAgent.publicKey, jobId);

    await program.methods
      .completeJob(jobId)
      .accounts({
        job: jobPubkey,
        workerAgent: workerAgent.publicKey,
      })
      .signers([workerAgent])
      .rpc();

    const jobAccount = await program.account.jobAccount.fetch(jobPubkey);
    assert.equal(
      jobAccount.status,
      { pendingRelease: {} } as unknown as number
    );
  });

  it("release_payment: poster approves, USDC transfers to worker ATA", async () => {
    const [jobPubkey] = jobPda(program.programId, posterAgent.publicKey, jobId);
    const [escrowPubkey] = escrowPda(
      program.programId,
      posterAgent.publicKey,
      jobId
    );

    const workerBalanceBefore = (
      await getAccount(provider.connection, workerAta)
    ).amount;

    await program.methods
      .releasePayment(jobId)
      .accounts({
        job: jobPubkey,
        escrowTokenAccount: escrowPubkey,
        workerTokenAccount: workerAta,
        posterAgent: posterAgent.publicKey,
      })
      .signers([posterAgent])
      .rpc();

    const jobAccount = await program.account.jobAccount.fetch(jobPubkey);
    assert.equal(jobAccount.status, { completed: {} } as unknown as number);

    const workerBalanceAfter = (
      await getAccount(provider.connection, workerAta)
    ).amount;
    assert.equal(
      Number(workerBalanceAfter - workerBalanceBefore),
      paymentAmount.toNumber()
    );
  });

  // ── Guard tests ─────────────────────────────────────────────────────────────

  it("rejects accept_job when poster tries to self-assign", async () => {
    const jobId2 = new BN(2);
    const [jobPubkey2] = jobPda(
      program.programId,
      posterAgent.publicKey,
      jobId2
    );
    const [escrowPubkey2] = escrowPda(
      program.programId,
      posterAgent.publicKey,
      jobId2
    );

    await program.methods
      .postJob(jobId2, "Self-assign test job", paymentAmount)
      .accounts({
        job: jobPubkey2,
        escrowTokenAccount: escrowPubkey2,
        posterTokenAccount: posterAta,
        usdcMint,
        posterAgent: posterAgent.publicKey,
      })
      .signers([posterAgent])
      .rpc();

    try {
      await program.methods
        .acceptJob(jobId2)
        .accounts({
          job: jobPubkey2,
          workerAgent: posterAgent.publicKey,
        })
        .signers([posterAgent])
        .rpc();
      assert.fail("Expected PosterCannotWork error");
    } catch (err: unknown) {
      assert.include((err as Error).message, "PosterCannotWork");
    }
  });
});
