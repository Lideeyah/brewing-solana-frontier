use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("BsFiGxfJ9Spn5kp6bJoCxAwswKRskpTiPodNt8EA6QdM");

// ── Constants ────────────────────────────────────────────────────────────────
pub const JOB_SEED: &[u8] = b"job";
pub const ESCROW_SEED: &[u8] = b"escrow";
pub const MAX_DESCRIPTION_LEN: usize = 512;

/// 2.5% protocol fee = 25 / 1_000
pub const FEE_NUMERATOR: u64 = 25;
pub const FEE_DENOMINATOR: u64 = 1_000;

/// Protocol treasury — receives 2.5% of every released payment.
pub const TREASURY: Pubkey = pubkey!("2WujcJGNEr45mikPcyR4jY8WVKXoADakYyh7UF6Jvspj");

// ── Program ──────────────────────────────────────────────────────────────────
#[program]
pub mod brewing {
    use super::*;

    /// Post a new job and lock the USDC payment in escrow immediately.
    pub fn post_job(
        ctx: Context<PostJob>,
        job_id: u64,
        description: String,
        payment_amount: u64,
    ) -> Result<()> {
        require!(
            description.len() <= MAX_DESCRIPTION_LEN,
            BrewingError::DescriptionTooLong
        );
        require!(payment_amount > 0, BrewingError::ZeroPayment);

        let job = &mut ctx.accounts.job;
        job.job_id             = job_id;
        job.description        = description;
        job.payment_amount     = payment_amount;
        job.poster_agent       = ctx.accounts.poster_agent.key();
        job.worker_agent       = Pubkey::default();
        job.status             = JobStatus::Open;
        job.verification_score = 0;
        job.bump               = ctx.bumps.job;
        job.escrow_bump        = ctx.bumps.escrow_token_account;

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from:      ctx.accounts.poster_token_account.to_account_info(),
                to:        ctx.accounts.escrow_token_account.to_account_info(),
                authority: ctx.accounts.poster_agent.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, payment_amount)?;

        emit!(JobPosted {
            job_id,
            poster_agent: job.poster_agent,
            payment_amount,
        });
        Ok(())
    }

    /// Accept an open job — lock the caller in as the worker.
    pub fn accept_job(ctx: Context<AcceptJob>, _job_id: u64) -> Result<()> {
        let job = &mut ctx.accounts.job;

        require!(job.status == JobStatus::Open, BrewingError::JobNotOpen);
        require!(
            ctx.accounts.worker_agent.key() != job.poster_agent,
            BrewingError::PosterCannotWork
        );

        job.worker_agent = ctx.accounts.worker_agent.key();
        job.status       = JobStatus::InProgress;

        emit!(JobAccepted {
            job_id:       job.job_id,
            worker_agent: job.worker_agent,
        });
        Ok(())
    }

    /// Worker marks the job complete and records the verification score.
    ///
    /// `verification_score` is computed off-chain by the Claude verifier:
    ///   ≥ 7  →  caller proceeds to `release_payment`
    ///   < 7  →  caller calls `dispute_job` instead (payment stays in escrow)
    pub fn complete_job(
        ctx: Context<CompleteJob>,
        _job_id: u64,
        verification_score: u8,
    ) -> Result<()> {
        require!(verification_score <= 10, BrewingError::InvalidScore);

        let job = &mut ctx.accounts.job;

        require!(
            job.status == JobStatus::InProgress,
            BrewingError::JobNotInProgress
        );
        require!(
            ctx.accounts.worker_agent.key() == job.worker_agent,
            BrewingError::UnauthorizedWorker
        );

        job.verification_score = verification_score;
        job.status             = JobStatus::PendingRelease;

        emit!(JobCompleted {
            job_id:             job.job_id,
            worker_agent:       job.worker_agent,
            verification_score,
        });
        Ok(())
    }

    /// Worker disputes the job when the verification score is below the
    /// threshold (< 7).  Payment stays in escrow; status becomes Disputed.
    pub fn dispute_job(
        ctx: Context<DisputeJob>,
        _job_id: u64,
        verification_score: u8,
    ) -> Result<()> {
        require!(verification_score <= 10, BrewingError::InvalidScore);

        let job = &mut ctx.accounts.job;

        require!(
            job.status == JobStatus::InProgress,
            BrewingError::JobNotInProgress
        );
        require!(
            ctx.accounts.worker_agent.key() == job.worker_agent,
            BrewingError::UnauthorizedWorker
        );

        job.verification_score = verification_score;
        job.status             = JobStatus::Disputed;

        emit!(JobDisputed {
            job_id:             job.job_id,
            worker_agent:       job.worker_agent,
            verification_score,
        });
        Ok(())
    }

    /// Poster reclaims USDC from a Disputed job.
    /// Full payment returns to the poster — no protocol fee on failed work.
    pub fn reclaim_escrow(ctx: Context<ReclaimEscrow>, job_id: u64) -> Result<()> {
        let job = &mut ctx.accounts.job;
        let amount = job.payment_amount;
        let poster_key = job.poster_agent;

        let job_id_bytes = job_id.to_le_bytes();
        let escrow_seeds: &[&[u8]] = &[
            ESCROW_SEED,
            poster_key.as_ref(),
            &job_id_bytes,
            &[job.escrow_bump],
        ];
        let signer_seeds = &[escrow_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from:      ctx.accounts.escrow_token_account.to_account_info(),
                    to:        ctx.accounts.poster_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_token_account.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        job.status = JobStatus::Cancelled;

        emit!(EscrowReclaimed {
            job_id,
            poster: poster_key,
            amount,
        });
        Ok(())
    }

    /// Release payment from escrow.
    ///
    /// Splits the payment:
    ///   97.5%  → worker token account
    ///    2.5%  → treasury token account (protocol fee)
    pub fn release_payment(ctx: Context<ReleasePayment>, job_id: u64) -> Result<()> {
        let job = &mut ctx.accounts.job;

        require!(
            job.status == JobStatus::PendingRelease,
            BrewingError::PaymentNotPending
        );
        require!(
            ctx.accounts.poster_agent.key() == job.poster_agent,
            BrewingError::UnauthorizedPoster
        );
        require!(
            ctx.accounts.treasury_token_account.owner == TREASURY,
            BrewingError::InvalidTreasury
        );

        let payment_amount = job.payment_amount;
        let poster_key     = job.poster_agent;

        // ── Fee split ────────────────────────────────────────────────────────
        let fee           = payment_amount * FEE_NUMERATOR / FEE_DENOMINATOR; // 2.5%
        let worker_amount = payment_amount - fee;

        // PDA signer: ["escrow", poster_pubkey, job_id_bytes]
        let job_id_bytes = job_id.to_le_bytes();
        let escrow_seeds: &[&[u8]] = &[
            ESCROW_SEED,
            poster_key.as_ref(),
            &job_id_bytes,
            &[job.escrow_bump],
        ];
        let signer_seeds = &[escrow_seeds];

        // Transfer 97.5% → worker
        let worker_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from:      ctx.accounts.escrow_token_account.to_account_info(),
                to:        ctx.accounts.worker_token_account.to_account_info(),
                authority: ctx.accounts.escrow_token_account.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(worker_ctx, worker_amount)?;

        // Transfer 2.5% → treasury (skip if fee rounds to zero for tiny payments)
        if fee > 0 {
            let treasury_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from:      ctx.accounts.escrow_token_account.to_account_info(),
                    to:        ctx.accounts.treasury_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_token_account.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(treasury_ctx, fee)?;
        }

        job.status = JobStatus::Completed;

        emit!(PaymentReleased {
            job_id:       job.job_id,
            worker_agent: job.worker_agent,
            amount:       worker_amount,
            fee,
        });
        Ok(())
    }
}

// ── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(job_id: u64, description: String, payment_amount: u64)]
pub struct PostJob<'info> {
    #[account(
        init,
        payer = poster_agent,
        space = JobAccount::LEN,
        seeds = [JOB_SEED, poster_agent.key().as_ref(), &job_id.to_le_bytes()],
        bump
    )]
    pub job: Account<'info, JobAccount>,

    #[account(
        init,
        payer = poster_agent,
        token::mint      = usdc_mint,
        token::authority = escrow_token_account,
        seeds = [ESCROW_SEED, poster_agent.key().as_ref(), &job_id.to_le_bytes()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = poster_token_account.owner == poster_agent.key(),
        constraint = poster_token_account.mint  == usdc_mint.key()
    )]
    pub poster_token_account: Account<'info, TokenAccount>,

    /// CHECK: validated via token account mint constraints above
    pub usdc_mint: UncheckedAccount<'info>,

    #[account(mut)]
    pub poster_agent: Signer<'info>,

    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent:           Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(_job_id: u64)]
pub struct AcceptJob<'info> {
    #[account(
        mut,
        seeds = [JOB_SEED, job.poster_agent.as_ref(), &job.job_id.to_le_bytes()],
        bump  = job.bump,
        constraint = job.status == JobStatus::Open @ BrewingError::JobNotOpen
    )]
    pub job: Account<'info, JobAccount>,

    pub worker_agent: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(_job_id: u64, verification_score: u8)]
pub struct CompleteJob<'info> {
    #[account(
        mut,
        seeds = [JOB_SEED, job.poster_agent.as_ref(), &job.job_id.to_le_bytes()],
        bump  = job.bump,
        constraint = job.status == JobStatus::InProgress @ BrewingError::JobNotInProgress
    )]
    pub job: Account<'info, JobAccount>,

    pub worker_agent: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(_job_id: u64, verification_score: u8)]
pub struct DisputeJob<'info> {
    #[account(
        mut,
        seeds = [JOB_SEED, job.poster_agent.as_ref(), &job.job_id.to_le_bytes()],
        bump  = job.bump,
        constraint = job.status == JobStatus::InProgress @ BrewingError::JobNotInProgress
    )]
    pub job: Account<'info, JobAccount>,

    pub worker_agent: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(job_id: u64)]
pub struct ReclaimEscrow<'info> {
    #[account(
        mut,
        seeds = [JOB_SEED, poster_agent.key().as_ref(), &job_id.to_le_bytes()],
        bump  = job.bump,
        has_one = poster_agent @ BrewingError::UnauthorizedPoster,
        constraint = job.status == JobStatus::Disputed @ BrewingError::JobNotDisputed
    )]
    pub job: Account<'info, JobAccount>,

    #[account(
        mut,
        seeds = [ESCROW_SEED, poster_agent.key().as_ref(), &job_id.to_le_bytes()],
        bump  = job.escrow_bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = poster_token_account.owner == poster_agent.key(),
        constraint = poster_token_account.mint  == escrow_token_account.mint
    )]
    pub poster_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub poster_agent: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(job_id: u64)]
pub struct ReleasePayment<'info> {
    #[account(
        mut,
        seeds = [JOB_SEED, poster_agent.key().as_ref(), &job_id.to_le_bytes()],
        bump  = job.bump,
        constraint = job.status == JobStatus::PendingRelease @ BrewingError::PaymentNotPending
    )]
    pub job: Account<'info, JobAccount>,

    #[account(
        mut,
        seeds = [ESCROW_SEED, poster_agent.key().as_ref(), &job_id.to_le_bytes()],
        bump  = job.escrow_bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// Worker's USDC ATA — receives 97.5% of the payment.
    #[account(
        mut,
        constraint = worker_token_account.owner == job.worker_agent @ BrewingError::UnauthorizedWorker,
        constraint = worker_token_account.mint  == escrow_token_account.mint
    )]
    pub worker_token_account: Account<'info, TokenAccount>,

    /// Treasury USDC ATA — receives 2.5% protocol fee.
    #[account(
        mut,
        constraint = treasury_token_account.owner == TREASURY @ BrewingError::InvalidTreasury,
        constraint = treasury_token_account.mint  == escrow_token_account.mint
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub poster_agent: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ── State ─────────────────────────────────────────────────────────────────────

#[account]
pub struct JobAccount {
    pub job_id:             u64,    // 8
    pub description:        String, // 4 + MAX_DESCRIPTION_LEN
    pub payment_amount:     u64,    // 8
    pub poster_agent:       Pubkey, // 32
    pub worker_agent:       Pubkey, // 32
    pub status:             JobStatus, // 1
    pub verification_score: u8,     // 1 — Claude quality score (0 = unverified, 1-10 = scored)
    pub bump:               u8,     // 1
    pub escrow_bump:        u8,     // 1
}

impl JobAccount {
    pub const LEN: usize = 8                    // discriminator
        + 8                                     // job_id
        + 4 + MAX_DESCRIPTION_LEN               // description
        + 8                                     // payment_amount
        + 32                                    // poster_agent
        + 32                                    // worker_agent
        + 1                                     // status enum
        + 1                                     // verification_score
        + 1                                     // bump
        + 1;                                    // escrow_bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum JobStatus {
    Open,           // 0 — posted, awaiting worker
    InProgress,     // 1 — worker accepted
    PendingRelease, // 2 — worker marked complete, awaiting poster approval
    Completed,      // 3 — payment released
    Disputed,       // 4 — verification score below threshold; payment in escrow
    Cancelled,      // 5 — disputed job reclaimed by poster; funds returned
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct JobPosted {
    pub job_id:         u64,
    pub poster_agent:   Pubkey,
    pub payment_amount: u64,
}

#[event]
pub struct JobAccepted {
    pub job_id:       u64,
    pub worker_agent: Pubkey,
}

#[event]
pub struct JobCompleted {
    pub job_id:             u64,
    pub worker_agent:       Pubkey,
    pub verification_score: u8,
}

#[event]
pub struct JobDisputed {
    pub job_id:             u64,
    pub worker_agent:       Pubkey,
    pub verification_score: u8,
}

#[event]
pub struct EscrowReclaimed {
    pub job_id:  u64,
    pub poster:  Pubkey,
    pub amount:  u64,
}

#[event]
pub struct PaymentReleased {
    pub job_id:       u64,
    pub worker_agent: Pubkey,
    pub amount:       u64,
    pub fee:          u64,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum BrewingError {
    #[msg("Job description exceeds maximum length of 512 characters")]
    DescriptionTooLong,
    #[msg("Payment amount must be greater than zero")]
    ZeroPayment,
    #[msg("Job is not in Open status")]
    JobNotOpen,
    #[msg("Job is not in InProgress status")]
    JobNotInProgress,
    #[msg("Payment is not pending release")]
    PaymentNotPending,
    #[msg("Caller is not the assigned worker")]
    UnauthorizedWorker,
    #[msg("Caller is not the job poster")]
    UnauthorizedPoster,
    #[msg("The poster cannot also be the worker")]
    PosterCannotWork,
    #[msg("Treasury token account owner does not match the protocol treasury")]
    InvalidTreasury,
    #[msg("Verification score must be between 0 and 10")]
    InvalidScore,
    #[msg("Job is not in Disputed status")]
    JobNotDisputed,
}
