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
  ActionResult,
  SubmitWorkResult,
  WalletAdapter,
} from "./types";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const IDL = require("./idl/brewing.json");

const PROGRAM_ID = new PublicKey(
  "BsFiGxfJ9Spn5kp6bJoCxAwswKRskpTiPodNt8EA6QdM"
);

const DEVNET_USDC = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

// ── Keypair → WalletAdapter shim (for server-side AI agents) ─────────────────
class KeypairWallet implements WalletAdapter {
  constructor(private readonly keypair: Keypair) {}
  get publicKey() { return this.keypair.publicKey; }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) {
      tx.sign(this.keypair);
    }
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
  return "Cancelled";
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
  /**
   * Post a new job and lock USDC in escrow immediately.
   * @param description  What the worker agent must deliver (max 512 chars)
   * @param paymentAmount  Amount in USDC (e.g. 50 = 50 USDC)
   * @param jobId  Optional explicit job ID — auto-generated from timestamp if omitted
   */
  async postJob(
    description: string,
    paymentAmount: number,
    jobId?: number
  ): Promise<PostJobResult> {
    if (!description.trim()) throw new Error("description is required");
    if (paymentAmount <= 0)  throw new Error("paymentAmount must be > 0");
    if (description.length > 512) throw new Error("description exceeds 512 chars");

    const id = jobId ?? Math.floor(Date.now() / 1000) % 100_000;
    const bnId = new BN(id);
    const poster = this.wallet.publicKey;
    const [jobPubkey] = jobPda(poster, bnId);
    const [escrowPubkey] = escrowPda(poster, bnId);
    const posterAta = await getAssociatedTokenAddress(this.usdcMint, poster);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig: string = await (this.program as any).methods
      .postJob(bnId, description.trim(), new BN(Math.round(paymentAmount * 1_000_000)))
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
  /**
   * Fetch all jobs currently Open and available to accept.
   */
  async getOpenJobs(): Promise<Job[]> {
    const all = await this.getAllJobs();
    return all.filter((j) => j.status === "Open");
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
  /**
   * Accept an open job. The connected wallet becomes the worker.
   * @param jobId  The job ID to accept
   */
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
   * Mark a job as complete. Payment auto-releases if the connected wallet is
   * also the poster (common in agent-to-agent or demo scenarios).
   *
   * @param jobId   The job ID to complete
   * @param result  Delivery artifact — stored in the transaction log via Memo
   */
  async submitWork(jobId: number, result: string): Promise<SubmitWorkResult> {
    const job = await this._requireJob(jobId, "InProgress");
    if (job.workerAgent !== this.wallet.publicKey.toBase58()) {
      throw new Error("Connected wallet is not the assigned worker for this job");
    }

    const bnId = new BN(jobId);
    const posterKey = new PublicKey(job.posterAgent);
    const [jobPubkey] = jobPda(posterKey, bnId);

    // Step 1 — complete_job (worker signs, records delivery on-chain)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completeTxSig: string = await (this.program as any).methods
      .completeJob(bnId)
      .accounts({
        job:         jobPubkey,
        workerAgent: this.wallet.publicKey,
      })
      .rpc();

    // Step 2 — auto release_payment if this wallet is also the poster
    const isPoster =
      posterKey.toBase58() === this.wallet.publicKey.toBase58();

    if (!isPoster) {
      return { completeTxSig, autoReleased: false };
    }

    const [escrowPubkey] = escrowPda(posterKey, bnId);
    const workerKey = new PublicKey(job.workerAgent!);
    const workerAta = await getAssociatedTokenAddress(this.usdcMint, workerKey);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const releaseTxSig: string = await (this.program as any).methods
      .releasePayment(bnId)
      .accounts({
        job:                jobPubkey,
        escrowTokenAccount: escrowPubkey,
        workerTokenAccount: workerAta,
        posterAgent:        posterKey,
      })
      .rpc();

    return { completeTxSig, releaseTxSig, autoReleased: true };
  }

  // ── releasePayment ──────────────────────────────────────────────────────────
  /**
   * Manually release payment (poster approves delivery).
   * Call this if submitWork could not auto-release.
   */
  async releasePayment(jobId: number): Promise<ActionResult> {
    const job = await this._requireJob(jobId, "PendingRelease");
    const bnId = new BN(jobId);
    const posterKey = new PublicKey(job.posterAgent);
    const [jobPubkey] = jobPda(posterKey, bnId);
    const [escrowPubkey] = escrowPda(posterKey, bnId);
    const workerKey = new PublicKey(job.workerAgent!);
    const workerAta = await getAssociatedTokenAddress(this.usdcMint, workerKey);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig: string = await (this.program as any).methods
      .releasePayment(bnId)
      .accounts({
        job:                jobPubkey,
        escrowTokenAccount: escrowPubkey,
        workerTokenAccount: workerAta,
        posterAgent:        this.wallet.publicKey,
      })
      .rpc();

    return { txSig };
  }

  // ── private helpers ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _parseAccount(a: any): Job {
    const zeroKey = PublicKey.default.toBase58();
    const workerStr = (a.account.workerAgent as PublicKey).toBase58();
    return {
      jobId:         (a.account.jobId as BN).toNumber(),
      description:   a.account.description as string,
      paymentAmount: (a.account.paymentAmount as BN).toNumber() / 1_000_000,
      posterAgent:   (a.account.posterAgent as PublicKey).toBase58(),
      workerAgent:   workerStr === zeroKey ? null : workerStr,
      status:        parseStatus(a.account.status as Record<string, unknown>),
      address:       (a.publicKey as PublicKey).toBase58(),
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
