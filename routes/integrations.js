// /root/scrapletdashboard/routes/integrations.js
import express from 'express';
import crypto from 'crypto';
import db from '../db.js';

const router = express.Router();

// --- state helpers (HMAC-signed blob containing user_id + exp) ---
function signState(payload, secret) {
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(json).digest('hex');
  return Buffer.from(JSON.stringify({ json, sig })).toString('base64url');
}
function verifyState(b64, secret) {
  try {
    const { json, sig } = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    const expected = crypto.createHmac('sha256', secret).update(json).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    const payload = JSON.parse(json);
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// GET /account/connect/kick  (button target)
router.get('/account/connect/kick', async (req, res) => {
  const user = req.session?.user;
  if (!user?.id) return res.status(401).send('Login required');

  const secret = process.env.DASHBOARD_STATE_SECRET || process.env.SESSION_SECRET || 'change-me';
  const state = signState(
    { user_id: user.id, iat: Date.now(), exp: Date.now() + 15 * 60 * 1000 }, // 15 min
    secret
  );

  // Redirect to Scrapbot’s OAuth start with state
  // Nginx already routes /auth/kick/* to Scrapbot:3030
  const url = `https://scraplet.store/auth/kick/start?state=${encodeURIComponent(state)}`;
  res.redirect(url);
});

// POST /api/link/kick  (Scrapbot calls this after OAuth)
// Headers: X-Scraplet-Signature: <hmac sha256 over raw body with SCRAPLET_SHARED_SECRET>
router.post('/api/link/kick', express.json(), async (req, res) => {
  const sig = req.headers['x-scraplet-signature'];
  const secret = process.env.SCRAPLET_SHARED_SECRET;
  if (!sig || !secret) return res.status(403).json({ ok: false, error: 'missing signature or secret' });

  const raw = JSON.stringify(req.body || {});
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return res.status(403).json({ ok: false, error: 'bad signature' });
    }
  } catch {
    return res.status(403).json({ ok: false, error: 'bad signature' });
  }

  const { state, identity, channels } = req.body || {};
  if (!state || !identity?.id || !identity?.username) {
    return res.status(400).json({ ok: false, error: 'invalid payload' });
  }

  // verify state (binds link to a specific dashboard user)
  const s = verifyState(state, process.env.DASHBOARD_STATE_SECRET || process.env.SESSION_SECRET || 'change-me');
  if (!s?.user_id) return res.status(400).json({ ok: false, error: 'invalid/expired state' });

  // Upsert external account
  const { rows: accRows } = await db.query(
    `
    insert into external_accounts (platform, external_user_id, username, user_id)
    values ('kick', $1, $2, $3)
    on conflict (platform, external_user_id) do update
      set username = excluded.username,
          user_id = excluded.user_id,
          updated_at = now()
    returning id
    `,
    [String(identity.id), String(identity.username), Number(s.user_id)]
  );
  const accountId = accRows[0].id;

  // Upsert channels (zero or more supplied by Scrapbot)
  if (Array.isArray(channels)) {
    for (const c of channels) {
      if (!c?.slug) continue;
      await db.query(
        `
        insert into channels (platform, channel_slug, chatroom_id, external_user_id, account_id)
        values ('kick', $1, $2, $3, $4)
        on conflict (platform, channel_slug) do update
          set chatroom_id = excluded.chatroom_id,
              external_user_id = excluded.external_user_id,
              account_id = excluded.account_id,
              updated_at = now()
        `,
        [String(c.slug), c.chatroom_id ?? null, String(identity.id), accountId]
      );
    }
  }

  console.log('[link:kick] linked', identity.username, '→ user_id', s.user_id);
  return res.json({ ok: true });
});

export default router;
