export type JobStatus =
  | 'Open'
  | 'InProgress'
  | 'PendingRelease'
  | 'Completed'
  | 'Cancelled';

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
}

export type ActivityType =
  | 'JobPosted'
  | 'JobAccepted'
  | 'JobCompleted'
  | 'PaymentReleased';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  jobId: number;
  actor: string;
  counterparty?: string;
  amount?: number;
  createdAt: number;   // ms timestamp — compute secondsAgo at render time so it stays live
  txSig: string;
}

// ── Capability helpers ────────────────────────────────────────────────────────

const CAP_PREFIX = /^\[cap:([^\]]+)\]\s*/;

/**
 * Decode a [cap:X] prefix from a raw on-chain description.
 * Returns { capability, task } — capability is undefined for legacy jobs.
 */
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

// All statuses use the same amber accent — differentiated by dot opacity and label only
export const STATUS_META: Record<JobStatus, { label: string; dotOpacity: number }> = {
  Open:           { label: 'Open',        dotOpacity: 1    },
  InProgress:     { label: 'In Progress', dotOpacity: 1    },
  PendingRelease: { label: 'Pending',     dotOpacity: 0.55 },
  Completed:      { label: 'Completed',   dotOpacity: 0    },
  Cancelled:      { label: 'Cancelled',   dotOpacity: 0    },
};

export const ACTIVITY_META: Record<ActivityType, { label: string; icon: string }> = {
  JobPosted:       { label: 'Job Posted',       icon: '+' },
  JobAccepted:     { label: 'Job Accepted',     icon: '·' },
  JobCompleted:    { label: 'Work Delivered',   icon: '✓' },
  PaymentReleased: { label: 'Payment Released', icon: '↑' },
};

// ── Demo scenario constants ───────────────────────────────────────────────────

export const DEMO_JOB_ID = 99;
export const DEMO_POSTER = '7DtrdZPc3LkP2JNMagV8SkLiKEMq4nURmDoNnV9GfJz8';
export const DEMO_WORKER = 'AQdKsDhNp4RtCBq3XmYwZ6FvTyJoL8sUiGhWxEz5Kb1';
