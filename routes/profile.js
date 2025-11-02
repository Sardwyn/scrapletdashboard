
import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';
import { ensureLayout, layoutDefaults, buildVisibilityMap } from '../utils/layout.js';
import { recordLayoutState } from '../utils/metrics.js';

const router = express.Router();


import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';
import { ensureLayout, layoutDefaults, buildVisibilityMap } from '../utils/layout.js';
import { recordLayoutState } from '../utils/metrics.js';

const router = express.Router();




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

    let layout = ensureLayout(result.rows[0]?.layout || {});
    recordLayoutState({ userId, layout });
    const sectionVisibility = buildVisibilityMap(layout);


    let layout = ensureLayout(result.rows[0]?.layout || {});
    recordLayoutState({ userId, layout });
    const sectionVisibility = buildVisibilityMap(layout);

    let layout = ensureLayout(result.rows[0]?.layout || {});
    recordLayoutState({ userId, layout });
    const sectionVisibility = buildVisibilityMap(layout);



    const buttonsResult = await db.query(
      'SELECT * FROM custom_buttons WHERE user_id = $1 ORDER BY sort_order NULLS LAST, created_at',
      [userId]
    );
    const customButtons = buttonsResult.rows;

    res.render('profile-configure', {
      user: req.session.user,
      layout,
      sectionVisibility,
      customButtons
    });


    res.render('profile-configure', {
      user: req.session.user,
      layout,
      sectionVisibility,
      customButtons
    });

    res.render('profile-configure', {
      user: req.session.user,
      layout,
      sectionVisibility,
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


  let layout = ensureLayout({
    sections: [
      { type: 'avatar', visible: !!req.body.avatar },
      { type: 'bio', visible: !!req.body.bio },
      { type: 'socialLinks', visible: !!req.body.socialLinks },
      { type: 'stats', visible: !!req.body.stats }
    ],
    theme: layoutDefaults.DEFAULT_THEME,
    order: Array.isArray(req.body.order) ? req.body.order : layoutDefaults.DEFAULT_ORDER,
    showButtonIcons: req.body.showButtonIcons === 'on'
  });
  recordLayoutState({ userId, layout });


  let layout = ensureLayout({
    sections: [
      { type: 'avatar', visible: !!req.body.avatar },
      { type: 'bio', visible: !!req.body.bio },
      { type: 'socialLinks', visible: !!req.body.socialLinks },
      { type: 'stats', visible: !!req.body.stats }
    ],
    theme: layoutDefaults.DEFAULT_THEME,
    order: Array.isArray(req.body.order) ? req.body.order : layoutDefaults.DEFAULT_ORDER,
    showButtonIcons: req.body.showButtonIcons === 'on'
  });
  recordLayoutState({ userId, layout });

  let layout = ensureLayout({
    sections: [
      { type: 'avatar', visible: !!req.body.avatar },
      { type: 'bio', visible: !!req.body.bio },
      { type: 'socialLinks', visible: !!req.body.socialLinks },
      { type: 'stats', visible: !!req.body.stats }
    ],
    theme: layoutDefaults.DEFAULT_THEME,
    order: Array.isArray(req.body.order) ? req.body.order : layoutDefaults.DEFAULT_ORDER,
    showButtonIcons: req.body.showButtonIcons === 'on'
  });
  recordLayoutState({ userId, layout });



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


    res.redirect('/dashboard');
  } catch (err) {

    res.redirect('/dashboard');␊
  } catch (err) {␊


    console.error('Error saving profile layout:', err);
    res.status(500).send('Failed to save layout');
  }
});

export default router;