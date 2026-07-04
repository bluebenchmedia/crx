/**
 * In-process abandon-cart scheduler.
 *
 * When a lead is captured (/api/lead) but the checkout (/api/v3/complete or
 * /api/complete) does not fire within ABANDON_DELAY_MS (default 5 minutes),
 * we POST to clearedrx-cs's /api/triggers/abandon endpoint so Allie can send
 * the +5min recovery email.
 *
 * Best-effort: timers live in this Node process only. A server restart loses
 * pending checks. That's acceptable for MVP — the worst case is some abandons
 * miss their 5min slot. Upgrade to a durable queue (BullMQ, Trigger.dev, SQS)
 * once volume justifies it.
 */

const crypto = require('crypto');

const ABANDON_DELAY_MS = Number(process.env.ABANDON_DELAY_MS || 5 * 60 * 1000);
const CS_BASE_URL = process.env.CS_BASE_URL || ''; // e.g. https://clearedrx-cs.example.com
const TRIGGER_SECRET = process.env.ABANDON_TRIGGER_SECRET || '';
const ENABLED = process.env.ABANDON_RECOVERY_ENABLED === 'true';

// email (lowercased) -> { timer, leadId, capturedAt }
const pendingChecks = new Map();
// email (lowercased) -> true (won't fire abandon for this email in this process)
const completedEmails = new Set();

function normalizeEmail(e) {
  return (e || '').trim().toLowerCase();
}

function hmacSign(body) {
  return 'sha256=' + crypto.createHmac('sha256', TRIGGER_SECRET).update(body).digest('hex');
}

async function fireAbandonTrigger(payload) {
  if (!CS_BASE_URL) {
    console.warn('[abandon] CS_BASE_URL not set; skipping fire for', payload.email);
    return;
  }
  const body = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json' };
  if (TRIGGER_SECRET) headers['X-Trigger-Signature'] = hmacSign(body);

  try {
    const res = await fetch(`${CS_BASE_URL}/api/triggers/abandon`, {
      method: 'POST', headers, body,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('[abandon] trigger failed', res.status, text.slice(0, 200));
    } else {
      console.log('[abandon] trigger sent for', payload.email, '→', text.slice(0, 100));
    }
  } catch (err) {
    console.error('[abandon] trigger error', err.message);
  }
}

/**
 * Schedule the abandon check. Call from /api/lead after a successful lead
 * capture. If the lead later completes checkout, cancelAbandonCheck() cancels.
 */
function scheduleAbandonCheck({ email, firstName, lastName, phone, leadId, quizUrl }) {
  if (!ENABLED) return;
  const e = normalizeEmail(email);
  if (!e) return;

  // Already completed this email in this process → don't schedule
  if (completedEmails.has(e)) return;

  // Already have a pending check → don't double-schedule (idempotent)
  if (pendingChecks.has(e)) return;

  const timer = setTimeout(async () => {
    pendingChecks.delete(e);
    if (completedEmails.has(e)) return; // raced with completion
    await fireAbandonTrigger({
      email: e,
      firstName,
      lastName,
      phone,
      leadId,
      quizUrl,
      abandonStage: 'quiz_lead_no_checkout',
    });
  }, ABANDON_DELAY_MS);

  // Don't block Node from exiting in dev
  if (timer.unref) timer.unref();

  pendingChecks.set(e, { timer, leadId, capturedAt: Date.now() });
  console.log('[abandon] scheduled check for', e, 'in', ABANDON_DELAY_MS, 'ms');
}

/**
 * Cancel a pending check. Call from /api/v3/complete (and /api/complete) when
 * the lead finishes checkout — they're no longer abandoned.
 */
function cancelAbandonCheck({ email }) {
  const e = normalizeEmail(email);
  if (!e) return;
  completedEmails.add(e);
  const pending = pendingChecks.get(e);
  if (pending) {
    clearTimeout(pending.timer);
    pendingChecks.delete(e);
    console.log('[abandon] cancelled check for', e, '(checkout completed)');
  }
}

function stats() {
  return {
    enabled: ENABLED,
    pending: pendingChecks.size,
    completedInProcess: completedEmails.size,
    delayMs: ABANDON_DELAY_MS,
    csConfigured: Boolean(CS_BASE_URL),
    secretConfigured: Boolean(TRIGGER_SECRET),
  };
}

module.exports = { scheduleAbandonCheck, cancelAbandonCheck, stats };
