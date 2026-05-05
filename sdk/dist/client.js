"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrewingClient = exports.VERIFICATION_THRESHOLD = exports.TREASURY_PUBKEY = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const bn_js_1 = __importDefault(require("bn.js"));
const types_1 = require("./types");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const IDL = require("./idl/brewing.json");
const PROGRAM_ID = new web3_js_1.PublicKey("BsFiGxfJ9Spn5kp6bJoCxAwswKRskpTiPodNt8EA6QdM");
const DEVNET_USDC = new web3_js_1.PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
/** Protocol treasury address — receives 2.5% of every released payment. */
exports.TREASURY_PUBKEY = new web3_js_1.PublicKey("2WujcJGNEr45mikPcyR4jY8WVKXoADakYyh7UF6Jvspj");
/** Minimum verification score to auto-release payment (inclusive). */
exports.VERIFICATION_THRESHOLD = 7;
// ── Keypair → WalletAdapter shim (for server-side AI agents) ─────────────────
class KeypairWallet {
    constructor(keypair) {
        this.keypair = keypair;
    }
    get publicKey() { return this.keypair.publicKey; }
    async signTransaction(tx) {
        if (tx instanceof web3_js_1.Transaction)
            tx.sign(this.keypair);
        return tx;
    }
    async signAllTransactions(txs) {
        return txs.map((tx) => {
            if (tx instanceof web3_js_1.Transaction)
                tx.sign(this.keypair);
            return tx;
        });
    }
}
// ── PDA helpers ───────────────────────────────────────────────────────────────
function jobPda(poster, jobId) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("job"), poster.toBuffer(), jobId.toArrayLike(Buffer, "le", 8)], PROGRAM_ID);
}
function escrowPda(poster, jobId) {
    return web3_js_1.PublicKey.findProgramAddressSync([
        Buffer.from("escrow"),
        poster.toBuffer(),
        jobId.toArrayLike(Buffer, "le", 8),
    ], PROGRAM_ID);
}
// ── Status parser ─────────────────────────────────────────────────────────────
function parseStatus(raw) {
    if ("open" in raw)
        return "Open";
    if ("inProgress" in raw)
        return "InProgress";
    if ("pendingRelease" in raw)
        return "PendingRelease";
    if ("completed" in raw)
        return "Completed";
    if ("disputed" in raw)
        return "Disputed";
    if ("cancelled" in raw)
        return "Cancelled";
    return "Disputed"; // fallback for unknown variants
}
// ── Main client ───────────────────────────────────────────────────────────────
class BrewingClient {
    constructor(config) {
        this.wallet =
            config.wallet instanceof web3_js_1.Keypair
                ? new KeypairWallet(config.wallet)
                : config.wallet;
        this.usdcMint = config.usdcMint ?? DEVNET_USDC;
        const provider = new anchor_1.AnchorProvider(config.connection, this.wallet, {
            commitment: "confirmed",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.program = new anchor_1.Program(IDL, provider);
    }
    // ── postJob ─────────────────────────────────────────────────────────────────
    async postJob(description, paymentAmount, options) {
        if (!description.trim())
            throw new Error("description is required");
        if (paymentAmount <= 0)
            throw new Error("paymentAmount must be > 0");
        const encoded = (0, types_1.encodeDescription)(description.trim(), options?.capability);
        if (encoded.length > 512)
            throw new Error("encoded description exceeds 512 chars");
        const id = options?.jobId ?? Math.floor(Date.now() / 1000) % 100000;
        const bnId = new bn_js_1.default(id);
        const poster = this.wallet.publicKey;
        const [jobPubkey] = jobPda(poster, bnId);
        const [escrowPubkey] = escrowPda(poster, bnId);
        const posterAta = await (0, spl_token_1.getAssociatedTokenAddress)(this.usdcMint, poster);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txSig = await this.program.methods
            .postJob(bnId, encoded, new bn_js_1.default(Math.round(paymentAmount * 1000000)))
            .accounts({
            job: jobPubkey,
            escrowTokenAccount: escrowPubkey,
            posterTokenAccount: posterAta,
            usdcMint: this.usdcMint,
            posterAgent: poster,
        })
            .rpc();
        return { jobId: id, txSig, jobAddress: jobPubkey.toBase58() };
    }
    // ── getOpenJobs ─────────────────────────────────────────────────────────────
    async getOpenJobs(capability) {
        const all = await this.getAllJobs();
        return all.filter((j) => {
            if (j.status !== "Open")
                return false;
            if (capability !== undefined && j.capability !== capability)
                return false;
            return true;
        });
    }
    // ── getAllJobs ──────────────────────────────────────────────────────────────
    async getAllJobs() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const accounts = await this.program.account.jobAccount.all();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return accounts.map((a) => this._parseAccount(a));
    }
    // ── getJob ──────────────────────────────────────────────────────────────────
    async getJob(jobId) {
        const all = await this.getAllJobs();
        return all.find((j) => j.jobId === jobId) ?? null;
    }
    // ── acceptJob ───────────────────────────────────────────────────────────────
    async acceptJob(jobId) {
        const job = await this._requireJob(jobId, "Open");
        const bnId = new bn_js_1.default(jobId);
        const posterKey = new web3_js_1.PublicKey(job.posterAgent);
        const [jobPubkey] = jobPda(posterKey, bnId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txSig = await this.program.methods
            .acceptJob(bnId)
            .accounts({
            job: jobPubkey,
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
    async submitWork(jobId, result, verificationScore) {
        const job = await this._requireJob(jobId, "InProgress");
        if (job.workerAgent !== this.wallet.publicKey.toBase58()) {
            throw new Error("Connected wallet is not the assigned worker for this job");
        }
        const bnId = new bn_js_1.default(jobId);
        const posterKey = new web3_js_1.PublicKey(job.posterAgent);
        const [jobPubkey] = jobPda(posterKey, bnId);
        // Step 1 — complete_job with verification score
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const completeTxSig = await this.program.methods
            .completeJob(bnId, verificationScore)
            .accounts({
            job: jobPubkey,
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
    async disputeJob(jobId, verificationScore) {
        const job = await this._requireJob(jobId, "InProgress");
        if (job.workerAgent !== this.wallet.publicKey.toBase58()) {
            throw new Error("Connected wallet is not the assigned worker for this job");
        }
        const bnId = new bn_js_1.default(jobId);
        const posterKey = new web3_js_1.PublicKey(job.posterAgent);
        const [jobPubkey] = jobPda(posterKey, bnId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txSig = await this.program.methods
            .disputeJob(bnId, verificationScore)
            .accounts({
            job: jobPubkey,
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
    async reclaimEscrow(jobId) {
        const job = await this._requireJob(jobId, "Disputed");
        const bnId = new bn_js_1.default(jobId);
        const posterKey = new web3_js_1.PublicKey(job.posterAgent);
        const [jobPubkey] = jobPda(posterKey, bnId);
        const [escrowPubkey] = escrowPda(posterKey, bnId);
        const posterAta = await (0, spl_token_1.getAssociatedTokenAddress)(this.usdcMint, this.wallet.publicKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txSig = await this.program.methods
            .reclaimEscrow(bnId)
            .accounts({
            job: jobPubkey,
            escrowTokenAccount: escrowPubkey,
            posterTokenAccount: posterAta,
            posterAgent: this.wallet.publicKey,
        })
            .rpc();
        return { txSig, amount: job.paymentAmount };
    }
    // ── releasePayment ──────────────────────────────────────────────────────────
    async releasePayment(jobId) {
        const job = await this._requireJob(jobId, "PendingRelease");
        const txSig = await this._doReleasePayment(job, jobId);
        return { txSig };
    }
    // ── private helpers ────────────────────────────────────────────────────────
    async _doReleasePayment(job, jobId) {
        const bnId = new bn_js_1.default(jobId);
        const posterKey = new web3_js_1.PublicKey(job.posterAgent);
        const [jobPubkey] = jobPda(posterKey, bnId);
        const [escrowPubkey] = escrowPda(posterKey, bnId);
        const workerKey = new web3_js_1.PublicKey(job.workerAgent);
        const workerAta = await (0, spl_token_1.getAssociatedTokenAddress)(this.usdcMint, workerKey);
        const treasuryAta = await (0, spl_token_1.getAssociatedTokenAddress)(this.usdcMint, exports.TREASURY_PUBKEY);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await this.program.methods
            .releasePayment(bnId)
            .accounts({
            job: jobPubkey,
            escrowTokenAccount: escrowPubkey,
            workerTokenAccount: workerAta,
            treasuryTokenAccount: treasuryAta,
            posterAgent: posterKey,
        })
            .rpc();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _parseAccount(a) {
        const zeroKey = web3_js_1.PublicKey.default.toBase58();
        const workerStr = a.account.workerAgent.toBase58();
        const rawDescription = a.account.description;
        const { capability, task } = (0, types_1.decodeDescription)(rawDescription);
        return {
            jobId: a.account.jobId.toNumber(),
            description: rawDescription,
            capability,
            task,
            paymentAmount: a.account.paymentAmount.toNumber() / 1000000,
            posterAgent: a.account.posterAgent.toBase58(),
            workerAgent: workerStr === zeroKey ? null : workerStr,
            status: parseStatus(a.account.status),
            verificationScore: a.account.verificationScore ?? 0,
            address: a.publicKey.toBase58(),
        };
    }
    async _requireJob(jobId, expectedStatus) {
        const job = await this.getJob(jobId);
        if (!job)
            throw new Error(`Job #${jobId} not found on-chain`);
        if (job.status !== expectedStatus) {
            throw new Error(`Job #${jobId} is ${job.status}, expected ${expectedStatus}`);
        }
        return job;
    }
}
exports.BrewingClient = BrewingClient;
//# sourceMappingURL=client.js.map