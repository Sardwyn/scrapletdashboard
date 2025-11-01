import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';

const router = express.Router();

// Helper: ensure layout has a valid structure
function ensureLayout(layout) {
  if (!layout || typeof layout !== 'object') {
    layout = {};
  }
  if (!Array.isArray(layout.sections)) {
    layout.sections = [
      { type: 'avatar', visible: true },
      { type: 'bio', visible: true },
      { type: 'socialLinks', visible: true },
      { type: 'featuredWidget', visible: false },
      { type: 'sponsorBanner', visible: false },
      { type: 'customHtml', visible: false }
    ];
  }
  if (!layout.theme) {
    layout.theme = { color: 'dark', font: 'sans', layout: 'stacked' };
  }
  if (!Array.isArray(layout.order)) {
    layout.order = ['avatar', 'bio', 'socialLinks'];
  }
  if (typeof layout.showButtonIcons !== 'boolean') {
    layout.showButtonIcons = true;
  }
  return layout;
}

// Icon inference helper
function inferIcon(label = '', url = '') {
  const lower = (label + ' ' + url).toLowerCase();
  if (lower.includes('twitch')) return 'twitch';
  if (lower.includes('youtube')) return 'youtube';
  if (lower.includes('paypal')) return 'paypal';
  if (lower.includes('discord')) return 'discord';
  if (lower.includes('github')) return 'github';
  if (lower.includes('x.com') || lower.includes('twitter')) return 'x-twitter';
  return null;
}

// GET /profile/configure — layout editor page
router.get('/configure', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) {
    console.debug('GET /profile/configure: No session user');
    return res.redirect('/auth/login');
  }

  try {
    const result = await db.query(
      'SELECT layout FROM users WHERE id = $1',
      [userId]
    );
    let layout = result.rows[0]?.layout || {};
    layout = ensureLayout(layout);

    const buttonsResult = await db.query(
      'SELECT * FROM custom_buttons WHERE user_id = $1 ORDER BY sort_order NULLS LAST, created_at',
      [userId]
    );
    const customButtons = buttonsResult.rows;

    res.render('profile-configure', {
      user: req.session.user,
      layout,
      customButtons
    });
  } catch (err) {
    console.error('Error loading profile layout:', err);
    res.status(500).send('Failed to load layout');
  }
});

// POST /profile/configure — save layout config
router.post('/configure', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) {
    console.debug('POST /profile/configure: No session user');
    return res.redirect('/auth/login');
  }

  let layout = {
    sections: [
  { type: 'avatar', visible: !!req.body.avatar },
  { type: 'bio', visible: !!req.body.bio },
  { type: 'socialLinks', visible: !!req.body.socialLinks },
  { type: 'stats', visible: !!req.body.stats },
  { type: 'featuredWidget', visible: false },
  { type: 'sponsorBanner', visible: false },
  { type: 'customHtml', visible: false }
],

    theme: {
      color: 'dark',
      font: 'sans',
      layout: 'stacked'
    },
    order: Array.isArray(req.body.order) ? req.body.order : ['avatar', 'bio', 'socialLinks', 'stats'],
    showButtonIcons: req.body.showButtonIcons === 'on'
  };
  layout = ensureLayout(layout);

  try {
    await db.query(
      'UPDATE users SET layout = $2 WHERE id = $1',
      [userId, layout]
    );

    const { buttonOrder = [], buttonVisible = {}, iconOverrides = {} } = req.body;

    if (Array.isArray(buttonOrder)) {
      for (let i = 0; i < buttonOrder.length; i++) {
        const id = buttonOrder[i];
        await db.query(
          'UPDATE custom_buttons SET sort_order = $1 WHERE id = $2 AND user_id = $3',
          [i, id, userId]
        );
      }
    }

    for (const [id, checked] of Object.entries(buttonVisible)) {
      await db.query(
        'UPDATE custom_buttons SET visible = $1 WHERE id = $2 AND user_id = $3',
        [!!checked, id, userId]
      );
    }

    for (const [id, icon] of Object.entries(iconOverrides)) {
      const trimmed = icon.trim();
      const finalIcon = trimmed || null;

      // If no override, infer from label/url
      if (!finalIcon) {
        const result = await db.query(
          'SELECT label, url FROM custom_buttons WHERE id = $1 AND user_id = $2',
          [id, userId]
        );
        const { label, url } = result.rows[0] || {};
        const inferred = inferIcon(label, url);
        await db.query(
          'UPDATE custom_buttons SET icon = $1 WHERE id = $2 AND user_id = $3',
          [inferred, id, userId]
        );
      } else {
        await db.query(
          'UPDATE custom_buttons SET icon = $1 WHERE id = $2 AND user_id = $3',
          [finalIcon, id, userId]
        );
      }
    }

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Error saving profile layout:', err);
    res.status(500).send('Failed to save layout');
  }
});

export default router;
