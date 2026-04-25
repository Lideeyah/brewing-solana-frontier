import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js";
import type {
  BrewingClientConfig,
  Job,
  JobStatus,
  PostJobResult,
  PostJobOptions,
  ActionResult,
  SubmitWorkResult,
  DisputeJobResult,
  ReclaimEscrowResult,
  WalletAdapter,
} from "./types";
import { encodeDescription, decodeDescription } from "./types";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const IDL = require("./idl/brewing.json");

const PROGRAM_ID = new PublicKey(
  "BsFiGxfJ9Spn5kp6bJoCxAwswKRskpTiPodNt8EA6QdM"
);

const DEVNET_USDC = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

/** Protocol treasury address — receives 2.5% of every released payment. */
export const TREASURY_PUBKEY = new PublicKey(
  "2WujcJGNEr45mikPcyR4jY8WVKXoADakYyh7UF6Jvspj"
);

/** Minimum verification score to auto-release payment (inclusive). */
export const VERIFICATION_THRESHOLD = 7;

// ── Keypair → WalletAdapter shim (for server-side AI agents) ─────────────────
class KeypairWallet implements WalletAdapter {
  constructor(private readonly keypair: Keypair) {}
  get publicKey() { return this.keypair.publicKey; }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) tx.sign(this.keypair);
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return txs.map((tx) => {
      if (tx instanceof Transaction) tx.sign(this.keypair);
      return tx;
    });
  }
}

// ── PDA helpers ───────────────────────────────────────────────────────────────
function jobPda(poster: PublicKey, jobId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("job"), poster.toBuffer(), jobId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

function escrowPda(poster: PublicKey, jobId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      poster.toBuffer(),
      jobId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
}

// ── Status parser ─────────────────────────────────────────────────────────────
function parseStatus(raw: Record<string, unknown>): JobStatus {
  if ("open" in raw)           return "Open";
  if ("inProgress" in raw)     return "InProgress";
  if ("pendingRelease" in raw) return "PendingRelease";
  if ("completed" in raw)      return "Completed";
  if ("disputed" in raw)       return "Disputed";
  if ("cancelled" in raw)      return "Cancelled";
  return "Disputed"; // fallback for unknown variants
}

// ── Main client ───────────────────────────────────────────────────────────────
export class BrewingClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private program: Program<any>;
  private wallet: WalletAdapter;
  private usdcMint: PublicKey;

  constructor(config: BrewingClientConfig) {
    this.wallet =
      config.wallet instanceof Keypair
        ? new KeypairWallet(config.wallet)
        : config.wallet;

    this.usdcMint = config.usdcMint ?? DEVNET_USDC;

    const provider = new AnchorProvider(config.connection, this.wallet as never, {
      commitment: "confirmed",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.program = new Program(IDL as any, provider);
  }

  // ── postJob ─────────────────────────────────────────────────────────────────
  async postJob(
    description: string,
    paymentAmount: number,
    options?: PostJobOptions
  ): Promise<PostJobResult> {
    if (!description.trim()) throw new Error("description is required");
    if (paymentAmount <= 0)  throw new Error("paymentAmount must be > 0");

    const encoded = encodeDescription(description.trim(), options?.capability);
    if (encoded.length > 512) throw new Error("encoded description exceeds 512 chars");

    const id = options?.jobId ?? Math.floor(Date.now() / 1000) % 100_000;
    const bnId = new BN(id);
    const poster = this.wallet.publicKey;
    const [jobPubkey] = jobPda(poster, bnId);
    const [escrowPubkey] = escrowPda(poster, bnId);
    const posterAta = await getAssociatedTokenAddress(this.usdcMint, poster);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig: string = await (this.program as any).methods
      .postJob(bnId, encoded, new BN(Math.round(paymentAmount * 1_000_000)))
      .accounts({
        job:                jobPubkey,
        escrowTokenAccount: escrowPubkey,
        posterTokenAccount: posterAta,
        usdcMint:           this.usdcMint,
        posterAgent:        poster,
      })
      .rpc();

    return { jobId: id, txSig, jobAddress: jobPubkey.toBase58() };
  }

  // ── getOpenJobs ─────────────────────────────────────────────────────────────
  async getOpenJobs(capability?: string): Promise<Job[]> {
    const all = await this.getAllJobs();
    return all.filter((j) => {
      if (j.status !== "Open") return false;
      if (capability !== undefined && j.capability !== capability) return false;
      return true;
    });
  }

  // ── getAllJobs ──────────────────────────────────────────────────────────────
  async getAllJobs(): Promise<Job[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts = await (this.program as any).account.jobAccount.all();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return accounts.map((a: any) => this._parseAccount(a));
  }

  // ── getJob ──────────────────────────────────────────────────────────────────
  async getJob(jobId: number): Promise<Job | null> {
    const all = await this.getAllJobs();
    return all.find((j) => j.jobId === jobId) ?? null;
  }

  // ── acceptJob ───────────────────────────────────────────────────────────────
  async acceptJob(jobId: number): Promise<ActionResult> {
    const job = await this._requireJob(jobId, "Open");
    const bnId = new BN(jobId);
    const posterKey = new PublicKey(job.posterAgent);
    const [jobPubkey] = jobPda(posterKey, bnId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig: string = await (this.program as any).methods
      .acceptJob(bnId)
      .accounts({
        job:         jobPubkey,
        workerAgent: this.wallet.publicKey,
      })
      .rpc();

    return { txSig };
  }

  // ── submitWork ──────────────────────────────────────────────────────────────
  /**
   * Submit completed work on-chain with its verification score.
   *
   * @param jobId             The job ID to complete
   * @param result            Delivery artifact (stored in transaction log via memo)
   * @param verificationScore Claude quality score 1-10 (must be ≥ VERIFICATION_THRESHOLD=7)
   *
   * Calls `complete_job` with the score, then `release_payment` if this
   * wallet is also the poster (auto-release for agent-to-agent flows).
   */
  async submitWork(
    jobId: number,
    result: string,
    verificationScore: number
  ): Promise<SubmitWorkResult> {
    const job = await this._requireJob(jobId, "InProgress");
    if (job.workerAgent !== this.wallet.publicKey.toBase58()) {
      throw new Error("Connected wallet is not the assigned worker for this job");
    }

    const bnId = new BN(jobId);
    const posterKey = new PublicKey(job.posterAgent);
    const [jobPubkey] = jobPda(posterKey, bnId);

    // Step 1 — complete_job with verification score
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completeTxSig: string = await (this.program as any).methods
      .completeJob(bnId, verificationScore)
      .accounts({
        job:         jobPubkey,
        workerAgent: this.wallet.publicKey,
      })
      .rpc();

    // Step 2 — auto release_payment if this wallet is also the poster
    const isPoster = posterKey.toBase58() === this.wallet.publicKey.toBase58();
    if (!isPoster) {
      return { completeTxSig, autoReleased: false, verificationScore };
    }

    const releaseTxSig = await this._doReleasePayment(job, jobId);
    return { completeTxSig, releaseTxSig, autoReleased: true, verificationScore };
  }

  // ── disputeJob ──────────────────────────────────────────────────────────────
  /**
   * Mark a job as Disputed when the verification score is below the threshold.
   * Payment stays in escrow; the job moves to Disputed status.
   *
   * @param jobId             The job ID to dispute
   * @param verificationScore Claude quality score 1-10 (should be < VERIFICATION_THRESHOLD=7)
   */
  async disputeJob(
    jobId: number,
    verificationScore: number
  ): Promise<DisputeJobResult> {
    const job = await this._requireJob(jobId, "InProgress");
    if (job.workerAgent !== this.wallet.publicKey.toBase58()) {
      throw new Error("Connected wallet is not the assigned worker for this job");
    }

    const bnId = new BN(jobId);
    const posterKey = new PublicKey(job.posterAgent);
    const [jobPubkey] = jobPda(posterKey, bnId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig: string = await (this.program as any).methods
      .disputeJob(bnId, verificationScore)
      .accounts({
        job:         jobPubkey,
        workerAgent: this.wallet.publicKey,
      })
      .rpc();

    return { txSig, verificationScore };
  }

  // ── reclaimEscrow ───────────────────────────────────────────────────────────
  /**
   * Poster reclaims full USDC payment from a Disputed job.
   * Status transitions to Cancelled. No protocol fee on failed work.
   *
   * @param jobId  The disputed job ID to reclaim
   */
  async reclaimEscrow(jobId: number): Promise<ReclaimEscrowResult> {
    const job = await this._requireJob(jobId, "Disputed");
    const bnId = new BN(jobId);
    const posterKey = new PublicKey(job.posterAgent);
    const [jobPubkey] = jobPda(posterKey, bnId);
    const [escrowPubkey] = escrowPda(posterKey, bnId);
    const posterAta = await getAssociatedTokenAddress(this.usdcMint, this.wallet.publicKey);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig: string = await (this.program as any).methods
      .reclaimEscrow(bnId)
      .accounts({
        job:                jobPubkey,
        escrowTokenAccount: escrowPubkey,
        posterTokenAccount: posterAta,
        posterAgent:        this.wallet.publicKey,
      })
      .rpc();

    return { txSig, amount: job.paymentAmount };
  }

  // ── releasePayment ──────────────────────────────────────────────────────────
  async releasePayment(jobId: number): Promise<ActionResult> {
    const job = await this._requireJob(jobId, "PendingRelease");
    const txSig = await this._doReleasePayment(job, jobId);
    return { txSig };
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private async _doReleasePayment(job: Job, jobId: number): Promise<string> {
    const bnId = new BN(jobId);
    const posterKey = new PublicKey(job.posterAgent);
    const [jobPubkey] = jobPda(posterKey, bnId);
    const [escrowPubkey] = escrowPda(posterKey, bnId);
    const workerKey = new PublicKey(job.workerAgent!);
    const workerAta = await getAssociatedTokenAddress(this.usdcMint, workerKey);
    const treasuryAta = await getAssociatedTokenAddress(this.usdcMint, TREASURY_PUBKEY);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (this.program as any).methods
      .releasePayment(bnId)
      .accounts({
        job:                    jobPubkey,
        escrowTokenAccount:     escrowPubkey,
        workerTokenAccount:     workerAta,
        treasuryTokenAccount:   treasuryAta,
        posterAgent:            posterKey,
      })
      .rpc() as string;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _parseAccount(a: any): Job {
    const zeroKey = PublicKey.default.toBase58();
    const workerStr = (a.account.workerAgent as PublicKey).toBase58();
    const rawDescription = a.account.description as string;
    const { capability, task } = decodeDescription(rawDescription);

    return {
      jobId:             (a.account.jobId as BN).toNumber(),
      description:       rawDescription,
      capability,
      task,
      paymentAmount:     (a.account.paymentAmount as BN).toNumber() / 1_000_000,
      posterAgent:       (a.account.posterAgent as PublicKey).toBase58(),
      workerAgent:       workerStr === zeroKey ? null : workerStr,
      status:            parseStatus(a.account.status as Record<string, unknown>),
      verificationScore: (a.account.verificationScore as number) ?? 0,
      address:           (a.publicKey as PublicKey).toBase58(),
    };
  }

  private async _requireJob(jobId: number, expectedStatus: JobStatus): Promise<Job> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error(`Job #${jobId} not found on-chain`);
    if (job.status !== expectedStatus) {
      throw new Error(`Job #${jobId} is ${job.status}, expected ${expectedStatus}`);
    }
    return job;
  }
}
