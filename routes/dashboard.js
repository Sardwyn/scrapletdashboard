import express from 'express';
import { widgets, overlays, getWidgetById } from '../utils/mockData.js';
import db from '../db.js';
import { getMetricsSnapshot } from '../utils/metrics.js';
import requireAuth from '../utils/requireAuth.js';
import { calculateMarketability } from '../utils/stats.js';
import { getClickstreamTrend } from '../services/toptenstats.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderPDF } from '../utils/pdf.js';

// stats helpers (single import point)
import {
  getStatsForUser,
  getProfileAnalytics,
  profileEngagementTrend,
  snapshotUserStats,
  getWeeklyTrends
} from '../scripts/stats.js';

const router = express.Router();
const STATS_TTL_HOURS = 24;

const toInt = v => Number.parseInt(v, 10);
const WINDOW_ALLOW = new Set([7, 30, 60]);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ────────────────────────────────────────────────────────────────────────────────
// Dashboard home (OVERVIEW PAGE)
router.get('/', requireAuth, (req, res) => {
  const sessionUser = req.session.user;
  const host = req.get('host') || 'scraplet.store';
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto?.split(',')[0] || req.protocol || 'https';
  const profileUrl = `${protocol}://${host}/u/${sessionUser.username}`;

  // keep this light — no stats payloads here
  res.render('dashboard', {
    activeTab: 'overview',
    user: sessionUser,
    widgets,
    overlays,
    profileUrl
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Analytics (STATS PAGE)
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.redirect('/login');

    // window param
    const rawWindow = toInt(req.query.window);
    const windowDays = WINDOW_ALLOW.has(rawWindow) ? rawWindow : 30;

    // take snapshot for weekly trend calculations
    await snapshotUserStats(userId);
    const weeklyTrends = await getWeeklyTrends(userId);

    // high-level analytics
    const profileAnalytics = await getProfileAnalytics(userId);
    const clickstreamTrend = await getClickstreamTrend(userId);
    const engagement = await profileEngagementTrend(userId, windowDays);

    // recent clicks
    const clickDetailsQ = await db.query(
      `SELECT action, referrer, timestamp
         FROM profile_clicks
        WHERE user_id = $1
        ORDER BY timestamp DESC
        LIMIT 20`,
      [userId]
    );
    const clickDetails = clickDetailsQ.rows || [];

    // referrers
    const referrerStatsQ = await db.query(
      `SELECT referrer, COUNT(*)::int AS count
         FROM profile_visits
        WHERE user_id = $1
        GROUP BY referrer
        ORDER BY COUNT(*) DESC`,
      [userId]
    );
    const referrerStats = referrerStatsQ.rows || [];

    // freshness check for external stats
    const recentStats = await db.query(
      `SELECT last_updated
         FROM stats
        WHERE user_id = $1
        ORDER BY last_updated DESC
        LIMIT 1`,
      [userId]
    );

    const isStale =
      !recentStats.rows.length ||
      (recentStats.rows[0].last_updated &&
        Date.now() - new Date(recentStats.rows[0].last_updated).getTime() >
          STATS_TTL_HOURS * 3600 * 1000);

    if (isStale) {
      const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = userResult.rows[0];
      if (user) {
        await getStatsForUser({
          userId,
          youtube: user.youtube,
          twitch: user.twitch,
          kick: user.kick,
          instagram: user.instagram,
          tiktok: user.tiktok,
          x: user.x,
          facebook: user.facebook
        });
      }
    }

    // primary stats row
    const statsResult = await db.query('SELECT * FROM user_stats WHERE user_id = $1', [userId]);
    const row = statsResult.rows[0] || {};

    const statsWithFreshness = Object.entries(row.followers || {}).map(([platform, followers]) => ({
      platform,
      followers,
      ccv: row.ccv?.[platform] ?? '—',
      engagement: row.engagement?.[platform] ?? '—',
      last_updated: row.last_updated,
      isFresh: row.last_updated
        ? Date.now() - new Date(row.last_updated).getTime() < STATS_TTL_HOURS * 3600 * 1000
        : false
    }));

    const grade = calculateMarketability(statsWithFreshness);

    // heatmap points
    const heatmapResult = await db.query(
      'SELECT x, y FROM profile_heatmap WHERE user_id = $1',
      [userId]
    );
    const heatmapPoints = (heatmapResult.rows || []).map(p => ({ x: p.x, y: p.y, value: 1 }));

    // headline views (window)
    const visitCount = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM profile_visits
        WHERE user_id = $1
          AND timestamp >= NOW() - INTERVAL '${windowDays} days'`,
      [userId]
    );

    // click buckets
    const clickStats = await db.query(
      `SELECT action, COUNT(*)::int AS count
         FROM profile_clicks
        WHERE user_id = $1
        GROUP BY action
        ORDER BY COUNT(*) DESC`,
      [userId]
    );
    const clickBuckets = (clickStats.rows || []).map(r => ({
      action: r.action,
      count: Number(r.count)
    }));

    res.render('dashboard-stats', {
      activeTab: 'stats',
      user: req.session.user,
      profile: req.session.user,
      stats: statsWithFreshness,
      grade,
      profileEngagementTrend: engagement,
      heatmapPoints,
      clickBuckets,
      clickstreamTrend,
      selectedWindow: windowDays,
      referrerStats,
      weeklyTrends,
      isPremium: req.session.user?.plan === 'pro',
      profileAnalytics: {
        views: visitCount.rows[0]?.count ?? 0,
        clicks: clickDetails.slice(0, 10)
      },
      clickDetails
    });

    console.log('Rendering heatmap with', heatmapPoints.length, 'points');
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// AJAX: engagement series + headline views
router.get('/api/stats/engagement', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user?.id;
    const rawWindow = Number.parseInt(req.query.window, 10);
    const windowDays = [7, 30, 60].includes(rawWindow) ? rawWindow : 30;

    const series = await profileEngagementTrend(userId, windowDays);

    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM profile_visits
        WHERE user_id = $1
          AND timestamp >= NOW() - INTERVAL '${windowDays} days'`,
      [userId]
    );

    res.json({
      windowDays,
      labels: series.dailyViews.map(d => d.date),
      values: series.dailyViews.map(d => d.count),
      percentChange: series.percentChange,
      totalViews: rows[0]?.count ?? 0
    });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// Metrics
router.get(['/metrics', '/metrics/'], requireAuth, (req, res) => {
  const metrics = getMetricsSnapshot();
  res.render('dashboard-metrics', {
    activeTab: 'overview',
    user: req.session.user,
    metrics,
    tokenConfigured: Boolean(process.env.ADMIN_METRICS_TOKEN)
  });
});

// Tab containers (generic)
router.get(['/overlays', '/widgets', '/account'], requireAuth, (req, res) => {
  const tab = req.path.slice(1); // overlays|widgets|account
  res.render('layout', {
    activeTab: tab,
    tabView: `tabs/${tab}`,
    user: req.session.user
  });
});

// widget preview
router.get('/widgets/preview/:id', requireAuth, (req, res) => {
  const widgetId = req.params.id;
  const config = global.widgetConfigs?.[widgetId] || {};
  console.debug(`Preview route hit for widget: ${widgetId}`, config);
  res.render(`widgets/${widgetId}`, { config, activeTab: 'widgets', user: req.session.user });
});

// save widget config
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

// widget config page
router.get('/widgets/:id/configure', requireAuth, async (req, res, next) => {
  try {
    const widgetId = req.params.id;
    const widget = await getWidgetById(widgetId);
    if (!widget) return res.status(404).send('Widget not found');

    res.render('widget-configure', {
      activeTab: 'widgets',
      widget,
      user: req.session.user
    });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 📄 Generate Pitch Deck PDF
router.get("/pitchdeck.pdf", async (req, res) => {
  const userId = req.session.user?.id;
  if (!userId) return res.redirect("/login");

  try {
    // Pull basic user info
    const userResult = await db.query(
      "SELECT username, plan, custom_intro FROM users WHERE id = $1",
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).send("User not found");

    // Try to snapshot for trends (don't fail PDF if perms/sequence are missing)
    try { await snapshotUserStats(userId); } catch (_) {}

    // Weekly trend deltas (safe default to [])
    let weeklyTrends = [];
    try { weeklyTrends = await getWeeklyTrends(userId); } catch (_) { weeklyTrends = []; }

    // Stats row
    const statsResult = await db.query(
      "SELECT * FROM user_stats WHERE user_id = $1",
      [userId]
    );
    const row = statsResult.rows[0] || {};

    // Normalize for the PDF table
    let performance = [];
    if (row && row.followers && typeof row.followers === "object") {
      performance = Object.keys(row.followers).map((platform) => ({
        platform,
        followers: row.followers?.[platform] ?? 0,
        engagement: row.engagement?.[platform] ?? 0,
        ccv: row.ccv?.[platform] ?? 0
      }));
    } else {
      performance = [{
        platform: "Overall",
        followers: row?.followers ?? 0,
        engagement: row?.engagement ?? 0,
        ccv: row?.ccv ?? 0
      }];
    }

    // Sections + theme
    const sections = ["overview", "stats", "grade"];
    if (user.plan === "pro") sections.push("insights");

    const theme = user.plan === "pro"
      ? { primary: "#4338CA", accent: "#6D28D9" }
      : { primary: "#1E3A8A", accent: "#3B82F6" };

    // Render the PDF
    const pdfBuffer = await renderPDF(
      path.join(__dirname, "../views/pitchdeck/base.ejs"),
      {
        title: `${user.username} — Media Kit`,
        user,
        introduction: user.custom_intro || "This creator hasn’t written their introduction yet.",
        performance,
        weeklyTrends,                // 👈 pass to EJS
        grade: "B+",
        date: new Date().toLocaleDateString(),
        theme,
        sections
      }
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${user.username}-pitchdeck.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).send("Failed to generate PDF");
  }
});


// ────────────────────────────────────────────────────────────────────────────────
// Redirect /dashboard/account → /account
router.get('/account', requireAuth, (req, res) => res.redirect('/account'));

// fallback “tab” safety
router.get('/:tab', requireAuth, (req, res) => {
  const tab = req.params.tab;
  const validTabs = ['overlays', 'widgets'];
  if (!validTabs.includes(tab)) return res.redirect('/dashboard');

  res.render('dashboard-metrics', {
    user: req.session.user,
    metrics: getMetricsSnapshot(),
    tokenConfigured: Boolean(process.env.ADMIN_METRICS_TOKEN)
  });
});

export default router;
