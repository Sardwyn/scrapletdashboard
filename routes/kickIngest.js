// /root/scrapletdashboard/routes/kickIngest.js
import express from 'express';
import crypto from 'crypto';
import db from '../db.js';

const router = express.Router();

// Verify shared secret
function verifySignature(req) {
  const secret = process.env.SCRAPLET_SHARED_SECRET;
  const sig = req.get('X-Scraplet-Signature');
  if (!secret || !sig || !req.rawBody) return false;

  // compute expected HMAC over the RAW bytes
  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)                // <-- raw bytes, not JSON.stringify(req.body)
    .digest('hex');

  // Normalize & quick sanity
  const headerHex = String(sig).trim().toLowerCase();
  if (!/^[a-f0-9]+$/.test(headerHex) || headerHex.length !== expectedHex.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(headerHex, 'hex'),
      Buffer.from(expectedHex, 'hex')
    );
  } catch {
    return false;
  }
}



router.post('/api/kick-ingest', async (req, res) => {
  try {
    if (!verifySignature(req)) {
      return res.status(401).json({ ok: false, error: 'invalid signature' });
    }

    const row = req.body;
    if (!row?.id || !row?.payload) {
      return res.status(400).json({ ok: false, error: 'bad payload' });
    }

    // 🔗 Look up which dashboard user this event belongs to
    const { rows: chanRows } = await db.query(
      `select ea.user_id
         from channels c
         join external_accounts ea on ea.id = c.account_id
        where c.platform = 'kick' and c.channel_slug = $1
        limit 1`,
      [row.channel_slug]
    );
    const userId = chanRows[0]?.user_id || null;

    // 🧠 Store in events table
    await db.query(
      `insert into events (
          id, v, source, kind, ts,
          channel_slug, chatroom_id, channel_id,
          actor_id, actor_username,
          payload, user_id
        )
        values (
          $1,$2,$3,$4,$5,
          $6,$7,$8,
          $9,$10,
          $11::jsonb,$12
        )
        on conflict (id) do update
          set v = excluded.v,
              source = excluded.source,
              kind = excluded.kind,
              ts = excluded.ts,
              channel_slug = excluded.channel_slug,
              chatroom_id = excluded.chatroom_id,
              channel_id = excluded.channel_id,
              actor_id = excluded.actor_id,
              actor_username = excluded.actor_username,
              payload = excluded.payload,
              user_id = coalesce(events.user_id, excluded.user_id)
      `,
      [
        row.id,
        row.v,
        row.source,
        row.kind,
        row.ts,
        row.channel_slug,
        row.chatroom_id,
        row.channel_id,
        row.actor_id,
        row.actor_username,
        JSON.stringify(row.payload),
        userId,
      ]
    );

    console.log(`[ingest] ${row.kind} ${row.channel_slug} ${row.actor_username || '-'} → user_id ${userId || 'null'}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[ingest] error', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
