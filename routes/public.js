import express from 'express';
import db from '../db.js';
import validator from 'validator';
import { getStatsForUser, gradeMarketability } from '../scripts/stats.js';

const router = express.Router();

const platformMap = {
  'twitch.tv': 'twitch',
  'youtube.com': 'youtube',
  'paypal.me': 'paypal',
  'x.com': 'x',
  'buymeacoffee.com': 'buy-me-a-coffee',
  'cash.app': 'cashapp',
  'discord.gg': 'discord',
  'instagram.com': 'instagram',
  'facebook.com': 'facebook',
  'snapchat.com': 'snapchat',
  'tiktok.com': 'tiktok',
  'venmo.com': 'venmo',
  'onlyfans.com': 'onlyfans',
  'threads.net': 'threads',
  'tumblr.com': 'tumblr',
  'deviantart.com': 'deviantart',
  'gog.com': 'gogdotcom',
  'epicgames.com': 'epic-games'
};

function ensureLayout(layout) {
  if (!layout || typeof layout !== 'object') layout = {};
  if (!Array.isArray(layout.sections)) {
    layout.sections = [
      { type: 'avatar', visible: true },
      { type: 'bio', visible: true },
      { type: 'socialLinks', visible: true },
      { type: 'stats', visible: true },
      { type: 'featuredWidget', visible: false },
      { type: 'sponsorBanner', visible: false },
      { type: 'customHtml', visible: false }
    ];
  }
  if (!layout.theme) layout.theme = { color: 'dark', font: 'sans', layout: 'stacked' };
  if (!Array.isArray(layout.order)) layout.order = ['avatar', 'bio', 'socialLinks', 'stats'];
  if (typeof layout.showButtonIcons !== 'boolean') layout.showButtonIcons = true;
  return layout;
}

function detectIcon(url) {
  if (!url) return null;
  const match = Object.entries(platformMap).find(([domain]) => url.includes(domain));
  return match?.[1] || null;
}

router.get('/u/:username', async (req, res) => {
  let { username } = req.params;
  username = validator.escape(username.trim());

  console.debug('Public profile request for:', username);

  try {
    const userResult = await db.query(
      `SELECT id, username, avatar_url, bio, x, youtube, twitch, kick, instagram, tiktok, facebook, layout
       FROM users
       WHERE username = $1`,
      [username]
    );

    const user = userResult.rows[0];
    if (!user) {
      console.debug('User not found:', username);
      return res.status(404).send('User not found');
    }

    const layout = ensureLayout(user.layout);

    const buttonsResult = await db.query(
      `SELECT id, label, url, visible, icon
       FROM custom_buttons
       WHERE user_id = $1
       ORDER BY sort_order NULLS LAST, created_at`,
      [user.id]
    );

    const customButtons = buttonsResult.rows.map(btn => {
      if (!btn.icon) {
        const detected = detectIcon(btn.url);
        if (detected) btn.icon = detected;
      }
      return btn;
    });

    let stats = {};
    let marketability = 'F';

    try {
      stats = await getStatsForUser({
        userId: user.id,
        youtube: user.youtube,
        twitch: user.twitch,
        kick: user.kick,
        instagram: user.instagram,
        tiktok: user.tiktok,
        x: user.x,
        facebook: user.facebook
      });

      marketability = gradeMarketability(stats);
    } catch (statsErr) {
      console.warn('Stats fetch failed:', statsErr);
    }

    console.debug('layout.showButtonIcons:', layout.showButtonIcons);

    res.render('public-profile', {
      username,
      profile: user,
      layout,
      customButtons,
      stats,
      marketability
    });
  } catch (err) {
    console.error('Public profile error:', err);
    res.status(500).send('Failed to load profile');
  }
});

export default router;
