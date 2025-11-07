import db from '../db.js';
import { getStatsFromPlatform } from './scrapers/index.js';
import {
  recordScraperRun,
  recordScraperSnapshot,
  recordApiStatus
} from '../utils/metrics.js';

//Helper for length adjustments in graphing

// --- window bucketing helper ---
function buildDayBuckets(windowDays = 30) {
  const wd = [7, 30, 60].includes(Number(windowDays)) ? Number(windowDays) : 30;
  const labels = [];
  const index = new Map();
  const today = new Date();
  // we’ll build 2*wd buckets (previous period + current period)
  for (let i = wd * 2 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    labels.push(key);
    index.set(key, labels.length - 1);
  }
  return { wd, labels, index };
}


const STATS_TTL_HOURS = 24;

export async function getProfileAnalytics(userId) {
  if (!userId) throw new Error('Missing userId');

  const visitCount = await db.query(
    'SELECT COUNT(*) FROM profile_visits WHERE user_id = $1',
    [userId]
  );

  const clickStats = await db.query(
    `SELECT action, COUNT(*) FROM profile_clicks
     WHERE user_id = $1 GROUP BY action`,
    [userId]
  );

  return {
    views: visitCount.rows[0].count,
    clicks: clickStats.rows
  };
}

const sanitize = (raw) => {
  if (!raw) return null;
  const cleaned = raw.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

  const ytMatch = cleaned.match(/youtube\.com\/(?:channel\/|@)?([^\/]+)/);
  if (ytMatch) return ytMatch[1];

  const twitchMatch = cleaned.match(/twitch\.tv\/([^\/]+)/);
  if (twitchMatch) return twitchMatch[1];

  return cleaned;
};

export async function getStatsForUser({
  userId,
  youtube,
  twitch,
  kick,
  instagram,
  tiktok,
  x,
  facebook
}) {
  const stats = {
    followers: {},
    ccv: {},
    engagement: {},
    apiStatus: {}
  };

  const { rows: cachedRows = [] } = await db.query(
    `SELECT * FROM user_stats
     WHERE user_id = $1
       AND last_updated > now() - interval '${STATS_TTL_HOURS} hours'`,
    [userId]
  );

  if (cachedRows.length) {
    console.debug('✅ Using cached stats for user:', userId);
    const row = cachedRows[0];
    const followers  = row.followers  || {};
    const ccv        = row.ccv        || {};
    const engagement = row.engagement || {};

    let timestamp = Date.now();
    if (row.last_updated instanceof Date) {
      timestamp = row.last_updated.getTime();
    } else if (row.last_updated) {
      const parsed = Date.parse(row.last_updated);
      if (!Number.isNaN(parsed)) timestamp = parsed;
    }

    const platformsFromCache = new Set([
      ...Object.keys(followers),
      ...Object.keys(ccv),
      ...Object.keys(engagement)
    ]);

    for (const platform of platformsFromCache) {
      recordScraperSnapshot({
        userId,
        platform,
        followers: followers[platform],
        ccv:        ccv[platform],
        engagement: engagement[platform],
        timestamp
      });
      recordApiStatus({ service: 'scraper', status: 'cache_hit', platform });
    }

    return {
      followers,
      ccv,
      engagement,
      marketability: row.marketability || 'F',
      last_updated: row.last_updated
    };
  }

  const platforms = { instagram, tiktok, x, youtube, facebook, kick, twitch };

  for (const [platform, rawHandle] of Object.entries(platforms)) {
    const handle = sanitize(rawHandle);
    if (!handle) continue;

    try {
      console.debug(`🔍 Scraping ${platform} for handle: ${handle}`);
      const result = await getStatsFromPlatform(platform, handle);

      if (result) {
        recordScraperRun({ platform, status: 'success' });

        if (result.followers  != null) stats.followers[platform]  = Number(result.followers)  || 0;
        if (result.engagement != null) stats.engagement[platform] = Number(result.engagement) || 0;
        if (result.ccv        != null) stats.ccv[platform]        = Number(result.ccv)        || 0;

        recordScraperSnapshot({
          userId,
          platform,
          followers:  stats.followers[platform],
          ccv:        stats.ccv[platform],
          engagement: stats.engagement[platform]
        });

        recordApiStatus({ service: 'scraper', status: 'success', platform });
        stats.apiStatus[platform] = 'ok';
      } else {
        recordScraperRun({ platform, status: 'failure' });
        recordApiStatus({ service: 'scraper', status: 'empty', platform });
        stats.apiStatus[platform] = 'fail';
      }
    } catch (err) {
      console.warn(`⚠️ ${platform} stats failed:`, err.message);
      recordScraperRun({ platform, status: 'failure' });
      recordApiStatus({ service: 'scraper', status: 'error', platform, detail: err.message });
      stats.apiStatus[platform] = 'fail';
    }
  }

  const marketability = gradeMarketability(stats);

  try {
    for (const platform of Object.keys(stats.followers)) {
      const followers  = stats.followers[platform]  ?? null;
      const ccv        = stats.ccv[platform]        ?? null;
      const engagement = stats.engagement[platform] ?? null;

      await db.query(
        `INSERT INTO stats (user_id, platform, followers, ccv, engagement, ingest_source, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (user_id, platform) DO UPDATE SET
           followers = $3,
           ccv = $4,
           engagement = $5,
           ingest_source = $6,
           last_updated = now()`,
        [userId, platform, followers, ccv, engagement, 'scraper']
      );

      console.log('Writing stats for', platform, stats.followers[platform], stats.ccv[platform]);
    }

    console.debug('📦 Cached fresh stats for user:', userId);
  } catch (err) {
    console.error('❌ Failed to cache stats:', err);
  }

  return {
    ...stats,
    marketability,
    last_updated: new Date()
  };
}

export function gradeMarketability(stats) {
  const totalFollowers = Object.values(stats.followers || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const totalEngagement = Object.values(stats.engagement || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const totalCCV = Object.values(stats.ccv || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);

  const score = totalFollowers * 0.5 + totalEngagement * 0.3 + totalCCV * 0.2;

  if (score > 100000) return 'A+';
  if (score > 50000) return 'A';
  if (score > 20000) return 'B';
  if (score > 5000) return 'C';
  if (score > 1000) return 'D';
  return 'F';
}

export async function profileEngagementTrend(userId, windowDays = 30) {
  if (!userId) throw new Error('Missing userId');

  const { wd, labels, index } = buildDayBuckets(windowDays);
  const lookback = wd * 2; // previous + current

  // Pull last 2*wd days of events
  const result = await db.query(
    `SELECT DATE_TRUNC('day', timestamp) AS date, COUNT(*) AS count
       FROM profile_visits
      WHERE user_id = $1
        AND timestamp >= NOW() - INTERVAL '${lookback} days'
      GROUP BY 1
      ORDER BY 1 ASC`,
    [userId]
  );

  // Map rows to buckets
  const buckets = new Array(labels.length).fill(0);
  for (const row of result.rows) {
    const key = new Date(row.date).toISOString().slice(0, 10);
    const i = index.get(key);
    if (i != null) buckets[i] = Number(row.count) || 0;
  }

  // Split previous/current windows
  const previous = buckets.slice(0, wd);
  const current  = buckets.slice(wd);

  const previousTotal = previous.reduce((s, n) => s + n, 0);
  const currentTotal  = current.reduce((s, n) => s + n, 0);

  const percentChange =
    previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;

  // Return only current window for the chart
  const dailyViews = labels.slice(wd).map((d, i) => ({
    date: d,
    count: current[i] || 0
  }));

  return { dailyViews, percentChange, windowDays: wd };
}
/**
 * Persist a per-platform snapshot for TODAY from user_stats.
 * Safe to call multiple times/day; ON CONFLICT prevents dupes.
 */
export async function snapshotUserStats(userId) {
  const { rows } = await db.query(
    'SELECT followers, engagement, ccv FROM user_stats WHERE user_id = $1',
    [userId]
  );
  const row = rows[0];
  if (!row) return;

  // JSONB-style structure expected (followers/engagement/ccv keyed by platform)
  const followers = row.followers || {};
  const engagement = row.engagement || {};
  const ccv = row.ccv || {};

  const platforms = Object.keys(followers);
  if (!platforms.length) return;

  const insertText = `
    INSERT INTO user_stats_history (user_id, platform, followers, engagement, ccv, snapshot_date)
    VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
    ON CONFLICT (user_id, platform, snapshot_date)
    DO UPDATE SET
      followers = EXCLUDED.followers,
      engagement = EXCLUDED.engagement,
      ccv = EXCLUDED.ccv
  `;

  for (const p of platforms) {
    await db.query(insertText, [
      userId,
      p,
      Number(followers[p] ?? 0),
      Number(engagement[p] ?? 0),
      Number(ccv[p] ?? 0),
    ]);
  }
}

/**
 * Weekly trend deltas (%), per platform.
 * previous = prior 7d max; current = last 7d max (robust vs gaps).
 */
export async function getWeeklyTrends(userId) {
  const { rows } = await db.query(`
    WITH spans AS (
      SELECT
        platform,
        MAX(followers) FILTER (WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days') AS current,
        MAX(followers) FILTER (WHERE snapshot_date >= CURRENT_DATE - INTERVAL '14 days'
                               AND snapshot_date < CURRENT_DATE - INTERVAL '7 days') AS previous
      FROM user_stats_history
      WHERE user_id = $1
      GROUP BY platform
    )
    SELECT platform,
           COALESCE(current, 0) AS current,
           COALESCE(previous, 0) AS previous
    FROM spans
    ORDER BY platform ASC
  `, [userId]);

  return rows.map(r => {
    const curr = Number(r.current || 0);
    const prev = Number(r.previous || 0);
    const deltaPct = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    return {
      platform: r.platform,
      current: curr,
      previous: prev,
      deltaPct: Number(deltaPct.toFixed(1))
    };
  });
}


