import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';
import { ensureLayout, layoutDefaults, buildVisibilityMap } from '../utils/layout.js';
import { recordLayoutState } from '../utils/metrics.js';

const router = express.Router();

const premiumTypes = ['sponsorBanner', 'customHtml', 'featuredWidget'];

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

// GET /profile/configure
router.get('/configure', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.redirect('/auth/login');

  try {
    const result = await db.query('SELECT layout FROM users WHERE id = $1', [userId]);
    const rawLayout = result.rows[0]?.layout || {};
    const layout = ensureLayout(rawLayout);

    recordLayoutState({ userId, layout });
    const sectionVisibility = buildVisibilityMap(layout);

    const buttonsResult = await db.query(
      'SELECT * FROM custom_buttons WHERE user_id = $1 ORDER BY sort_order NULLS LAST, created_at',
      [userId]
    );

    res.render('profile-configure', {
      user: req.session.user,
      layout,
      sectionVisibility,
      customButtons: buttonsResult.rows
    });
  } catch (err) {
    console.error('Error loading profile layout:', err);
    res.status(500).send('Failed to load layout');
  }
});

// POST /profile/configure
router.post('/configure', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.redirect('/auth/login');

  const rawOrder = req.body['sectionOrder[]'];
const allTypes = layoutDefaults.DEFAULT_SECTIONS.map(s => s.type);
const postedOrder = Array.isArray(rawOrder) ? rawOrder : [];

const sectionMap = new Map();
allTypes.forEach(type => {
  sectionMap.set(type, {
    type,
    visible: Object.prototype.hasOwnProperty.call(req.body, type),
    premium: premiumTypes.includes(type)
  });
});

const orderedSections = postedOrder
  .filter(type => sectionMap.has(type))
  .map(type => sectionMap.get(type));

// Append any missing types (not posted)
const missingTypes = allTypes.filter(type => !postedOrder.includes(type));
missingTypes.forEach(type => {
  orderedSections.push(sectionMap.get(type));
});

const sections = orderedSections;



  const updatedLayout = {
    sections,
    theme: {
      ...layoutDefaults.DEFAULT_THEME,
      ...(typeof req.body.theme === 'object' ? req.body.theme : {})
    },
    showButtonIcons: req.body.showButtonIcons === 'on'
  };

  try {
    await db.query('UPDATE users SET layout = $2 WHERE id = $1', [userId, updatedLayout]);

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
