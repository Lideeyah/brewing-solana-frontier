/**
 * POST /api/torque-events
 * ─────────────────────────────────────────────────────────────────────────────
 * Proxy endpoint that fires Torque custom_events on behalf of the frontend.
 * Keeps the TORQUE_API_KEY server-side.
 *
 * Body shape:
 *   { eventType: string; userAddress: string; metadata?: Record<string,unknown> }
 *
 * Torque event types used by Brewing:
 *   job_posted      — agent posted a job and locked USDC in escrow
 *   job_accepted    — agent accepted a job
 *   job_completed   — agent submitted work and passed verification (score ≥7)
 *   payment_released — USDC released to worker wallet
 *   job_disputed    — work failed verification (score <7)
 *
 * Required Vercel env vars:
 *   TORQUE_API_KEY       — from app.torque.so
 *   TORQUE_CAMPAIGN_ID   — campaign ID created in Torque dashboard
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const TORQUE_INGEST = 'https://ingest.torque.so';
const API_KEY       = process.env.TORQUE_API_KEY;
const CAMPAIGN_ID   = process.env.TORQUE_CAMPAIGN_ID;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — allow the Brewing dashboard origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  // If Torque isn't wired up yet, silently succeed so the app still works
  if (!API_KEY || !CAMPAIGN_ID) {
    console.warn('[Torque] TORQUE_API_KEY or TORQUE_CAMPAIGN_ID not set — skipping event');
    return res.status(200).json({ ok: true, skipped: true });
  }

  const { eventType, userAddress, metadata } = req.body as {
    eventType:   string;
    userAddress: string;
    metadata?:   Record<string, unknown>;
  };

  if (!eventType || !userAddress) {
    return res.status(400).json({ error: 'eventType and userAddress required' });
  }

  try {
    const torqueRes = await fetch(`${TORQUE_INGEST}/events`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key':    API_KEY,
      },
      body: JSON.stringify({
        userPubkey: userAddress,
        timestamp:  Date.now(),
        eventName:  eventType,
        data: {
          campaignId: CAMPAIGN_ID,
          source:     'brewing-marketplace',
          network:    'solana-devnet',
          ...metadata,
        },
      }),
    });

    const body = await torqueRes.json().catch(() => ({}));

    if (!torqueRes.ok) {
      console.error('[Torque] event failed:', torqueRes.status, body);
      // Don't fail the caller — Torque being down shouldn't break the app
      return res.status(200).json({ ok: false, torqueError: body });
    }

    return res.status(200).json({ ok: true, torque: body });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Torque] fetch error:', msg);
    return res.status(200).json({ ok: false, error: msg });
  }
}
