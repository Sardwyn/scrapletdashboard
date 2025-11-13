// /routes/dashboard.js
import express from 'express';
import { widgets, overlays, getWidgetById } from '../utils/mockData.js';
import db from '../db.js';
import { getMetricsSnapshot } from '../utils/metrics.js';
import { calculateMarketability } from '../utils/stats.js';
import requireAuth from '../utils/requireAuth.js';

const router = express.Router();

// /routes/dashboard.js
router.get('/', requireAuth, async (req, res) => {
  const sessionUser = req.session.user;
  const host = req.get('host') || 'scraplet.store';
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto?.split(',')[0] || req.protocol || 'https';
  const profileUrl = `${protocol}://${host}/u/${sessionUser.username}`;

  let kickAccount = null;
  try {
    const { rows } = await db.query(
      `
      SELECT username
      FROM public.external_accounts
      WHERE platform = 'kick' AND user_id = $1
      LIMIT 1
      `,
      [sessionUser.id]
    );
    kickAccount = rows[0] || null;
  } catch (e) {
    console.error('Error loading Kick external account:', e);
  }

  res.render('layout', {
    tabView: 'dashboard',
    user: sessionUser,
    widgets,
    overlays,
    profileUrl,
    kickAccount,
  });
});



/**
 * METRICS VIEW (existing metrics page)
 */
router.get(['/metrics', '/metrics/'], requireAuth, (req, res) => {
  const metrics = getMetricsSnapshot();

  res.render('layout', {
    tabView: 'dashboard-metrics',
    user: req.session.user,
    metrics,
    tokenConfigured: Boolean(process.env.ADMIN_METRICS_TOKEN),
  });
});

// GET /dashboard/stats – Stats page backed by DB
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const userId = sessionUser.id;

    // 1) Current JSON stats from user_stats (canonical from scrapers)
    const { rows: userStatsRows } = await db.query(
      `
      SELECT followers, ccv, engagement, marketability, last_updated
      FROM public.user_stats
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    let stats = [];
    let marketabilityGrade = 'F';
    let lastUpdated = null;

    if (userStatsRows.length) {
      const row = userStatsRows[0];
      const followers = row.followers || {};
      const ccv = row.ccv || {};
      const engagement = row.engagement || {};

      const platforms = new Set([
        ...Object.keys(followers),
        ...Object.keys(ccv),
        ...Object.keys(engagement),
      ]);

      stats = Array.from(platforms).map((platform) => ({
        platform,
        followers: Number(followers[platform] ?? 0),
        ccv: Number(ccv[platform] ?? 0),
        engagement: Number(engagement[platform] ?? 0),
        marketability: row.marketability || null,
        last_updated: row.last_updated,
      }));

      marketabilityGrade =
        row.marketability ||
        calculateMarketability(
          stats.map((s) => ({
            followers: s.followers,
            ccv: s.ccv,
            last_updated: s.last_updated,
          }))
        );

      lastUpdated = row.last_updated;
    }

    // 2) History window (for weekly trends + sparklines)
    const { rows: historyRows } = await db.query(
      `
      SELECT platform, followers, engagement, ccv, snapshot_date
      FROM public.user_stats_history
      WHERE user_id = $1
      ORDER BY snapshot_date ASC
      `,
      [userId]
    );

    const weeklyTrends = (() => {
      if (!historyRows.length) return [];

      const byPlatform = new Map();
      for (const row of historyRows) {
        const key = row.platform;
        if (!byPlatform.has(key)) byPlatform.set(key, []);
        byPlatform.get(key).push(row);
      }

      const maxTime = Math.max(
        ...historyRows.map((r) => new Date(r.snapshot_date).getTime())
      );
      const maxDate = new Date(maxTime);
      const dayMs = 24 * 60 * 60 * 1000;
      const recentStart = new Date(maxDate.getTime() - 6 * dayMs);
      const prevStart = new Date(recentStart.getTime() - 7 * dayMs);

      const avg = (rows) =>
        rows.length
          ? rows.reduce((s, r) => s + Number(r.followers || 0), 0) /
            rows.length
          : 0;

      const out = [];
      for (const [platform, rows] of byPlatform.entries()) {
        const recent = rows.filter((r) => {
          const d = new Date(r.snapshot_date);
          return d >= recentStart && d <= maxDate;
        });
        const prev = rows.filter((r) => {
          const d = new Date(r.snapshot_date);
          return d >= prevStart && d < recentStart;
        });

        const curAvg = avg(recent);
        const prevAvg = avg(prev);
        const deltaPct = prevAvg > 0 ? ((curAvg - prevAvg) / prevAvg) * 100 : 0;

        out.push({
          platform,
          current: Math.round(curAvg),
          previous: Math.round(prevAvg),
          deltaPct,
        });
      }

      out.sort((a, b) => (b.deltaPct || 0) - (a.deltaPct || 0));
      return out;
    })();

    // 3) Profile visits (engagement + referrers)
    const { rows: visitRows } = await db.query(
      `
      SELECT visitor_ip, referrer, "timestamp"
      FROM public.profile_visits
      WHERE user_id = $1
      ORDER BY "timestamp" DESC
      LIMIT 500
      `,
      [userId]
    );

    // 4) Profile clicks (CTA / link performance)
    const { rows: clickRows } = await db.query(
      `
      SELECT action, referrer, "timestamp"
      FROM public.profile_clicks
      WHERE user_id = $1
      ORDER BY "timestamp" DESC
      LIMIT 200
      `,
      [userId]
    );

    // 5) Heatmap points
    const { rows: heatmapRows } = await db.query(
      `
      SELECT x, y, "timestamp"
      FROM public.profile_heatmap
      WHERE user_id = $1
      ORDER BY "timestamp" DESC
      LIMIT 500
      `,
      [userId]
    );

    // ----- transforms for EJS -----

    const refBuckets = new Map();
    for (const v of visitRows) {
      const key =
        v.referrer && v.referrer.trim() ? v.referrer.trim() : 'direct';
      refBuckets.set(key, (refBuckets.get(key) || 0) + 1);
    }
    const referrers = Array.from(refBuckets.entries())
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count);

    const clickBucketsMap = new Map();
    for (const c of clickRows) {
      const key = c.action || 'unknown';
      clickBucketsMap.set(key, (clickBucketsMap.get(key) || 0) + 1);
    }
    const clickBuckets = Array.from(clickBucketsMap.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);

    const clickDetails = clickRows.slice(0, 30).map((c) => ({
      action: c.action,
      referrer: c.referrer || 'direct',
      timestamp: c.timestamp,
    }));

    const heatmapPoints = heatmapRows.map((h) => ({
      x: Number(h.x),
      y: Number(h.y),
      timestamp: h.timestamp,
    }));

    const audienceWindowDays = 14;
    const engagementWindowDays = 30;

    const totalViews = visitRows.length;
    const profileAnalytics = {
      views: totalViews,
      viewsChangePct: weeklyTrends[0]?.deltaPct ?? 0,
    };

    const profileEngagementTrend = {
      windowDays: engagementWindowDays,
      percentChange: weeklyTrends[0]?.deltaPct ?? 0,
      dailyViews: [], // hydrated via /dashboard/api/stats/engagement
    };

    // 🔹 key change: render layout wrapper so CSS + nav/footer appear
    res.render('layout', {
      tabView: 'dashboard-stats',
      user: sessionUser,

      stats,
      weeklyTrends,
      marketabilityGrade,
      referrers,
      clickBuckets,
      clickDetails,
      clickEvents: clickDetails,
      heatmapPoints,
      audienceWindowDays,
      engagementWindowDays,
      selectedWindow: engagementWindowDays,
      profileAnalytics,
      referrerStats: referrers,
      profileEngagementTrend,
      lastUpdated,
    });
  } catch (err) {
    console.error('Error loading stats dashboard:', err);
    res.status(500).render('500');
  }
});


/**
 * API: Audience growth (total followers from user_stats_history)
 * GET /dashboard/api/stats/audience-growth?days=14
 */
router.get('/api/stats/audience-growth', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    let days = parseInt(req.query.days || '14', 10);
    if (!Number.isFinite(days) || days < 7) days = 7;
    if (days > 90) days = 90;

    const { rows } = await db.query(
      `
      SELECT snapshot_date, SUM(followers) AS total_followers
      FROM public.user_stats_history
      WHERE user_id = $1
        AND snapshot_date >= CURRENT_DATE - ($2::int - 1)
      GROUP BY snapshot_date
      ORDER BY snapshot_date
      `,
      [userId, days]
    );

    const map = new Map();
    for (const r of rows) {
      const d = r.snapshot_date.toISOString().slice(0, 10);
      map.set(d, Number(r.total_followers || 0));
    }

    const today = new Date();
    const labels = [];
    const values = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      labels.push(key);
      values.push(map.get(key) || 0);
    }

    res.json({
      success: true,
      windowDays: days,
      labels,
      values,
    });
  } catch (err) {
    console.error('Audience growth API error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

/**
 * API: Engagement time series (profile_visits)
 * GET /dashboard/api/stats/engagement?window=30
 */
router.get('/api/stats/engagement', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    let windowDays = parseInt(req.query.window || '30', 10);
    if (!Number.isFinite(windowDays) || windowDays < 7) windowDays = 7;
    if (windowDays > 90) windowDays = 90;

    const totalSpan = windowDays * 2;

    const { rows } = await db.query(
      `
      SELECT "timestamp"
      FROM public.profile_visits
      WHERE user_id = $1
        AND "timestamp" >= NOW() - ($2::int * INTERVAL '1 day')
      ORDER BY "timestamp"
      `,
      [userId, totalSpan]
    );

    const counts = new Map();
    for (const r of rows) {
      const d = r.timestamp.toISOString().slice(0, 10);
      counts.set(d, (counts.get(d) || 0) + 1);
    }

    const today = new Date();
    const allDates = [];
    for (let i = totalSpan - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      allDates.push(d.toISOString().slice(0, 10));
    }

    const recentDates = allDates.slice(-windowDays);
    const prevDates = allDates.slice(0, allDates.length - windowDays);

    const values = recentDates.map((d) => counts.get(d) || 0);
    const totalViews = values.reduce((s, v) => s + v, 0);

    const prevTotal = prevDates.reduce(
      (s, d) => s + (counts.get(d) || 0),
      0
    );

    const percentChange =
      prevTotal > 0 ? ((totalViews - prevTotal) / prevTotal) * 100 : 0;

    res.json({
      success: true,
      windowDays,
      labels: recentDates,
      values,
      totalViews,
      percentChange,
    });
  } catch (err) {
    console.error('Engagement stats API error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

/**
 * API: Sparklines per platform (user_stats_history)
 * GET /dashboard/api/stats/sparkline
 */
router.get('/api/stats/sparkline', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const windowDays = 30;

    const { rows } = await db.query(
      `
      SELECT platform, followers, snapshot_date
      FROM public.user_stats_history
      WHERE user_id = $1
        AND snapshot_date >= CURRENT_DATE - ($2::int - 1)
      ORDER BY platform, snapshot_date
      `,
      [userId, windowDays]
    );

    const dataByPlatform = new Map();
    for (const r of rows) {
      const platform = r.platform;
      if (!dataByPlatform.has(platform)) dataByPlatform.set(platform, []);
      dataByPlatform.get(platform).push({
        date: r.snapshot_date.toISOString().slice(0, 10),
        followers: Number(r.followers || 0),
      });
    }

    const data = {};
    for (const [platform, arr] of dataByPlatform.entries()) {
      data[platform] = arr;
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Sparkline stats API error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

/**
 * Tab-specific views (overlays / widgets / account) using layout
 */
router.get(['/overlays', '/widgets', '/account'], requireAuth, (req, res) => {
  const tab = req.path.replace(/^\//, ''); // 'overlays' | 'widgets' | 'account'

  res.render('layout', {
    tabView: `tabs/${tab}`,
    user: req.session.user,
  });
});

/**
 * Widget preview (raw widget view)
 */
router.get('/widgets/preview/:id', requireAuth, (req, res) => {
  const widgetId = req.params.id;
  const config = global.widgetConfigs?.[widgetId] || {};

  console.debug(`Preview route hit for widget: ${widgetId}`, config);

  res.render(`widgets/${widgetId}`, { config });
});

/**
 * Save widget config
 */
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

/**
 * Widget config page
 */
router.get('/widgets/:id/configure', requireAuth, async (req, res) => {
  const widgetId = req.params.id;
  const widget = await getWidgetById(widgetId);

  if (!widget) {
    console.debug(`Widget not found: ${widgetId}`);
    return res.status(404).send('Widget not found');
  }

  res.render('widget-configure', {
    widget,
    user: req.session.user,
  });
});

/**
 * Public profile page (still mounted at /dashboard/u/:username
 * because index mounts router at /dashboard)
 */
router.get('/u/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const userResult = await db.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).send('User not found');

    const profileResult = await db.query(
      'SELECT * FROM profiles WHERE user_id = $1',
      [user.id]
    );
    const profile = profileResult.rows[0] || {};

    res.render('public-profile', { username, profile });
  } catch (err) {
    console.error('Public profile error:', err);
    res.status(500).send('Failed to load profile');
  }
});

export default router;
