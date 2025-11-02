import express from 'express';
import { widgets, overlays, getWidgetById } from '../utils/mockData.js';
import db from '../db.js';
import { getMetricsSnapshot } from '../utils/metrics.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    console.debug('requireAuth: No session user found');
    return res.redirect('/auth/login');
  }
  console.debug('requireAuth: Session user present:', req.session.user.id);
  next();
}

// Main dashboard landing view
router.get('/', requireAuth, (req, res) => {
  const sessionUser = req.session.user;
  const host = req.get('host') || 'scraplet.store';
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto?.split(',')[0] || req.protocol || 'https';
  const profileUrl = `${protocol}://${host}/u/${sessionUser.username}`;

  res.render('dashboard', {
    user: sessionUser,
    widgets,
    overlays,
    profileUrl
  });
});

router.get('/metrics', requireAuth, (req, res) => {
  const metrics = getMetricsSnapshot();

  res.render('dashboard-metrics', {
    user: req.session.user,
    metrics,
    tokenConfigured: Boolean(process.env.ADMIN_METRICS_TOKEN)
  });
});

// Tab-specific views
router.get('/:tab', requireAuth, (req, res) => {
  const tab = req.params.tab;
  const validTabs = ['overlays', 'widgets', 'account'];

  if (!validTabs.includes(tab)) {
    console.debug(`Invalid tab requested: ${tab}`);
    return res.redirect('/dashboard');
  }

  res.render('layout', {
    tabView: `tabs/${tab}`,
    user: req.session.user
  });
});

// Widget preview
router.get('/widgets/preview/:id', requireAuth, (req, res) => {
  const widgetId = req.params.id;
  const config = global.widgetConfigs?.[widgetId] || {};

  console.debug(`Preview route hit for widget: ${widgetId}`, config);

  res.render(`widgets/${widgetId}`, { config });
});

// Save widget config
router.post('/widgets/:id/save', requireAuth, (req, res) => {
  const widgetId = req.params.id;
  const config = req.body;

  if (!widgetId || typeof config !== 'object') {
    console.warn('Invalid widget config submission');
    return res.status(400).send('Invalid widget config');
  }

  global.widgetConfigs = global.widgetConfigs || {};
  global.widgetConfigs[widgetId] = config;

  res.redirect(`/dashboard/widgets/${widgetId}/configure`);
});

// Widget config page
router.get('/widgets/:id/configure', requireAuth, async (req, res) => {
  const widgetId = req.params.id;
  const widget = await getWidgetById(widgetId);

  if (!widget) {
    console.debug(`Widget not found: ${widgetId}`);
    return res.status(404).send('Widget not found');
  }

  res.render('widget-configure', {
    widget,
    user: req.session.user
  });
});

// Public profile page
router.get('/u/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const userResult = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).send('User not found');

    const profileResult = await db.query('SELECT * FROM profiles WHERE user_id = $1', [user.id]);
    const profile = profileResult.rows[0] || {};

    res.render('public_profile', { username, profile });
  } catch (err) {
    console.error('Public profile error:', err);
    res.status(500).send('Failed to load profile');
  }
});

export default router;
