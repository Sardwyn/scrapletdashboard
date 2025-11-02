import express from 'express';
import db from '../db.js';
import validator from 'validator';
import { getStatsForUser, gradeMarketability } from '../scripts/stats.js';
import { ensureLayout, buildVisibilityMap } from '../utils/layout.js';
import { recordProfileRequest, recordLayoutState } from '../utils/metrics.js';

import { ensureLayout, buildVisibilityMap } from '../utils/layout.js';
import { recordProfileRequest, recordLayoutState } from '../utils/metrics.js';

import { ensureLayout } from '../utils/layout.js';


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


function detectIcon(url) {

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
      recordProfileRequest({ username, status: 'not_found' });
      console.debug('User not found:', username);
      return res.status(404).send('User not found');
    }

    const layout = ensureLayout(user.layout);
    const sectionVisibility = buildVisibilityMap(layout);
    recordLayoutState({ userId: user.id, layout });

grafana-dashbaord
    if (!user) {
      recordProfileRequest({ username, status: 'not_found' });
      console.debug('User not found:', username);
      return res.status(404).send('User not found');
    }

    const layout = ensureLayout(user.layout);
    const sectionVisibility = buildVisibilityMap(layout);
    recordLayoutState({ userId: user.id, layout });

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


    const customButtons = buttonsResult.rows
      .filter(btn => btn.visible !== false)
      .map(btn => {
        const button = { ...btn };
        if (!button.icon) {
          const detected = detectIcon(button.url);
          if (detected) button.icon = detected;
        }
        return button;
      });

    const customButtons = buttonsResult.rows
      .filter(btn => btn.visible !== false)
      .map(btn => {
        const button = { ...btn };
        if (!button.icon) {
          const detected = detectIcon(button.url);
          if (detected) button.icon = detected;
        }
        return button;
      });


    let stats = {};
    let marketability = 'F';

    try {

      const statsResult = await getStatsForUser({
        userId: user.id,
        youtube: user.youtube,
        twitch: user.twitch,
        kick: user.kick,
        instagram: user.instagram,
        tiktok: user.tiktok,
        x: user.x,
        facebook: user.facebook
      });
      marketability = statsResult.marketability ?? gradeMarketability(statsResult);
      stats = { ...statsResult };
    } catch (statsErr) {
      console.warn('Stats fetch failed:', statsErr);
    }

    console.debug('layout.showButtonIcons:', layout.showButtonIcons);

    recordProfileRequest({ userId: user.id, username, status: 'success' });

    res.render('public-profile', {
      username,
      profile: user,
      layout,
      sectionVisibility,
      customButtons,
      stats,
      marketability
    });
  } catch (err) {
    console.error('Public profile error:', err);
    recordProfileRequest({ username, status: 'error' });
    res.status(500).send('Failed to load profile');
  }
});

      const statsResult = await getStatsForUser({
        userId: user.id,
        youtube: user.youtube,
        twitch: user.twitch,
        kick: user.kick,
        instagram: user.instagram,
        tiktok: user.tiktok,
        x: user.x,
        facebook: user.facebook
      });
      marketability = statsResult.marketability ?? gradeMarketability(statsResult);
      stats = { ...statsResult };
    } catch (statsErr) {
      console.warn('Stats fetch failed:', statsErr);
    }

    console.debug('layout.showButtonIcons:', layout.showButtonIcons);

    recordProfileRequest({ userId: user.id, username, status: 'success' });

    res.render('public-profile', {
      username,
      profile: user,
      layout,
      sectionVisibility,
      customButtons,
      stats,
      marketability
    });
  } catch (err) {
    console.error('Public profile error:', err);
    recordProfileRequest({ username, status: 'error' });
    res.status(500).send('Failed to load profile');
  }
});


export default router;
