export type JobStatus =
  | 'Open'
  | 'InProgress'
  | 'PendingRelease'
  | 'Completed'
  | 'Disputed';

export interface Job {
  jobId: number;
  /** Raw on-chain description string (may include a [cap:X] prefix) */
  description: string;
  /**
   * Parsed capability tag — e.g. "research", "coding", "analysis".
   * Undefined if the job was posted without a capability tag.
   */
  capability?: string;
  /**
   * The task the worker must complete — description with [cap:X] prefix stripped.
   * Falls back to the full description for legacy jobs.
   */
  task: string;
  paymentUsdc: number;
  posterAgent: string;
  workerAgent: string | null;
  status: JobStatus;
  postedAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  tag: string;
  /** Claude verification score 1-10. 0 = unverified. ≥7 → paid, <7 → Disputed. */
  verificationScore?: number;
}

export type ActivityType =
  | 'JobPosted'
  | 'JobAccepted'
  | 'JobCompleted'
  | 'PaymentReleased'
  | 'JobDisputed';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  jobId: number;
  actor: string;
  counterparty?: string;
  amount?: number;
  verificationScore?: number;
  createdAt: number;   // ms timestamp — compute secondsAgo at render time so it stays live
  txSig: string;
}

// ── Capability helpers ────────────────────────────────────────────────────────

const CAP_PREFIX = /^\[cap:([^\]]+)\]\s*/;

export function decodeDescription(raw: string): { capability?: string; task: string } {
  const match = raw.match(CAP_PREFIX);
  if (match) {
    return { capability: match[1], task: raw.replace(CAP_PREFIX, '') };
  }
  return { task: raw };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function shortAddr(addr: string): string {
  return addr.slice(0, 4) + '…' + addr.slice(-4);
}

export function shortTx(sig: string): string {
  return sig.slice(0, 8) + '…';
}

export function relativeTime(secondsAgo: number): string {
  if (secondsAgo < 60)    return `${secondsAgo}s ago`;
  if (secondsAgo < 3600)  return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / 86400)}d ago`;
}

// All statuses use amber — Disputed uses red accent
export const STATUS_META: Record<JobStatus, { label: string; dotOpacity: number; color?: string }> = {
  Open:           { label: 'Open',        dotOpacity: 1    },
  InProgress:     { label: 'In Progress', dotOpacity: 1    },
  PendingRelease: { label: 'Pending',     dotOpacity: 0.55 },
  Completed:      { label: 'Completed',   dotOpacity: 0    },
  Disputed:       { label: 'Disputed',    dotOpacity: 0,    color: '#ef4444' },
};

export const ACTIVITY_META: Record<ActivityType, { label: string; icon: string }> = {
  JobPosted:       { label: 'Job Posted',       icon: '+' },
  JobAccepted:     { label: 'Job Accepted',     icon: '·' },
  JobCompleted:    { label: 'Work Delivered',   icon: '✓' },
  PaymentReleased: { label: 'Payment Released', icon: '↑' },
  JobDisputed:     { label: 'Job Disputed',     icon: '!' },
};

// ── Demo scenario constants ───────────────────────────────────────────────────

export const DEMO_JOB_ID = 99;
export const DEMO_POSTER = '7DtrdZPc3LkP2JNMagV8SkLiKEMq4nURmDoNnV9GfJz8';
export const DEMO_WORKER = 'AQdKsDhNp4RtCBq3XmYwZ6FvTyJoL8sUiGhWxEz5Kb1';
