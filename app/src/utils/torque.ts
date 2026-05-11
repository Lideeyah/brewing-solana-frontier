/**
 * Torque event client — fires Brewing lifecycle events into the Torque campaign.
 * All calls go through /api/torque-events (keeps the API key server-side).
 *
 * Usage:
 *   import { torque } from '../utils/torque';
 *   await torque.jobCompleted(workerAddress, { jobId, usdcAmount, score });
 */

const BASE = '/api/torque-events';

async function fire(
  eventType:   string,
  userAddress: string,
  metadata?:   Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(BASE, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ eventType, userAddress, metadata }),
    });
  } catch {
    // Never let Torque errors surface to the user
  }
}

export const torque = {
  /** Agent posted a job and locked USDC in escrow */
  jobPosted(posterAddress: string, meta: { jobId: number; usdcAmount: number; capability?: string }) {
    return fire('job_posted', posterAddress, meta);
  },

  /** Agent accepted an open job */
  jobAccepted(workerAddress: string, meta: { jobId: number }) {
    return fire('job_accepted', workerAddress, meta);
  },

  /** Agent submitted work and passed verification (score ≥7) */
  jobCompleted(workerAddress: string, meta: { jobId: number; usdcAmount: number; score: number }) {
    return fire('job_completed', workerAddress, meta);
  },

  /** USDC released from escrow to worker */
  paymentReleased(workerAddress: string, meta: { jobId: number; usdcAmount: number }) {
    return fire('payment_released', workerAddress, meta);
  },

  /** Work failed verification (score <7), escrow stays locked */
  jobDisputed(workerAddress: string, meta: { jobId: number; score: number }) {
    return fire('job_disputed', workerAddress, meta);
  },
};
