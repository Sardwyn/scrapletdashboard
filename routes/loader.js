// /routes/loader.js
import express from 'express';
import db from '../db.js';
import { verifyWidgetToken } from '../utils/widgetTokens.js';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Contract:
 * - Public OBS/Browser source points to:  GET /w/:token
 * - That page bootstraps widget with 2 JSON hits:
 *     GET /w/:token/config   -> public-safe widget config
 *     GET /w/:token/ping     -> health (optional)
 *
 * Future: SSE at /w/:token/events for real-time triggers
 */

// Hard guard: no token, no render
function decodeOr403(req, res) {
  const token = req.params.token || req.query.token || '';
  const claims = verifyWidgetToken(token);
  if (!claims) {
    return res.status(401).send('Invalid or expired widget token.');
  }
  return claims;
}

// Render widget shell (HTML) that mounts the client JS
router.get('/w/:token', async (req, res) => {
  const claims = decodeOr403(req, res);
  if (!claims) return;

  // Optional: basic host check (helps avoid embedding on random domains)
  // const host = req.get('host');
  // if (!/yourdomain/.test(host)) return res.status(403).send('Invalid host');

  // Minimal HTML shell – widget client does the rest
  res.type('html').send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'self' 'unsafe-inline' https: data: blob:; img-src * data: blob:; media-src * data: blob:;">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Scraplet Widget</title>
  <style>
    html,body { margin:0; padding:0; background:transparent; }
  </style>
</head>
<body>
  <div id="root"></div>

  <script>
    // The public loader boot – keeps token only in memory
    (async function(){
      const token = ${JSON.stringify(req.params.token)};
      const cfgRes = await fetch('/w/' + token + '/config', { credentials: 'omit' });
      if (!cfgRes.ok) {
        document.body.innerHTML = '<pre style="color:#f88">Failed to load widget config</pre>';
        return;
      }
      const cfg = await cfgRes.json();

      // Very-simple default renderer (Alert Box MVP)
      // You’ll replace with your proper widget client later.
      const root = document.getElementById('root');
      root.style.cssText = 'position:relative; width:100vw; height:100vh; overflow:hidden;';

      const el = document.createElement('div');
      el.style.cssText = 'position:absolute; bottom:10%; left:50%; transform:translateX(-50%); padding:12px 16px; background:rgba(20,20,30,0.8); color:#fff; border-radius:8px; font-family:Inter,system-ui,sans-serif;';
      el.textContent = (cfg && cfg.sampleText) || 'Widget online ✨';
      root.appendChild(el);
    })();
  </script>
</body>
</html>
  `);
});

// Public-safe config for the widget
router.get('/w/:token/config', async (req, res) => {
  const claims = decodeOr403(req, res);
  if (!claims) return;

  const userId = Number(claims.sub);
  const widgetId = String(claims.wid);

  // TODO: gate here later (plan/entitlements) before returning data
  // Example entitlement check (future):
  // const { rows } = await db.query('SELECT enabled FROM user_widgets WHERE user_id=$1 AND widget_id=$2', [userId, widgetId]);
  // if (!rows[0]?.enabled) return res.status(403).json({ error: 'Not entitled' });

  // Pull user-specific config if you have it; otherwise return defaults
  // For now, return a minimal demo config.
  return res.json({
    widgetId,
    theme: 'dark',
    sampleText: 'Alert Box (MVP) is connected',
  });
});

// Health/ping (optional, handy for OBS)
router.get('/w/:token/ping', (req, res) => {
  const claims = verifyWidgetToken(req.params.token || '');
  if (!claims) return res.status(401).json({ ok: false });
  res.json({ ok: true, wid: claims.wid, sub: claims.sub });
});

export default router;
