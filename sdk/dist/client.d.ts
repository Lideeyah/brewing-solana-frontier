import { PublicKey } from "@solana/web3.js";
import type { BrewingClientConfig, Job, PostJobResult, PostJobOptions, ActionResult, SubmitWorkResult, DisputeJobResult, ReclaimEscrowResult } from "./types";
/** Protocol treasury address — receives 2.5% of every released payment. */
export declare const TREASURY_PUBKEY: PublicKey;
/** Minimum verification score to auto-release payment (inclusive). */
export declare const VERIFICATION_THRESHOLD = 7;
export declare class BrewingClient {
    private program;
    private wallet;
    private usdcMint;
    constructor(config: BrewingClientConfig);
    postJob(description: string, paymentAmount: number, options?: PostJobOptions): Promise<PostJobResult>;
    getOpenJobs(capability?: string): Promise<Job[]>;
    getAllJobs(): Promise<Job[]>;
    getJob(jobId: number): Promise<Job | null>;
    acceptJob(jobId: number): Promise<ActionResult>;
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
    submitWork(jobId: number, result: string, verificationScore: number): Promise<SubmitWorkResult>;
    /**
     * Mark a job as Disputed when the verification score is below the threshold.
     * Payment stays in escrow; the job moves to Disputed status.
     *
     * @param jobId             The job ID to dispute
     * @param verificationScore Claude quality score 1-10 (should be < VERIFICATION_THRESHOLD=7)
     */
    disputeJob(jobId: number, verificationScore: number): Promise<DisputeJobResult>;
    /**
     * Poster reclaims full USDC payment from a Disputed job.
     * Status transitions to Cancelled. No protocol fee on failed work.
     *
     * @param jobId  The disputed job ID to reclaim
     */
    reclaimEscrow(jobId: number): Promise<ReclaimEscrowResult>;
    releasePayment(jobId: number): Promise<ActionResult>;
    private _doReleasePayment;
    private _parseAccount;
    private _requireJob;
}
//# sourceMappingURL=client.d.ts.map