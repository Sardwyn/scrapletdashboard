import db from '../db.js';
import { getStatsFromPlatform } from './scrapers/index.js';

const STATS_TTL_HOURS = 24;
const sanitize = str => {
  if (!str) return null;
  const cleaned = str.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

  // YouTube special case
  const ytMatch = cleaned.match(/youtube\.com\/(channel\/|@)?([^\/]+)/);
  if (ytMatch) return ytMatch[2];

  // Twitch special case
  const twitchMatch = cleaned.match(/twitch\.tv\/([^\/]+)/);
  if (twitchMatch) return twitchMatch[1];

  return cleaned;
};




export async function getStatsForUser({ userId, youtube, twitch, kick, instagram, tiktok, x, facebook }) {
  const stats = {
    followers: {},
    ccv: {},
    engagement: {},
    apiStatus: {}
  };

  // Check cache
  const cached = await db.query(
    `SELECT * FROM user_stats WHERE user_id = $1 AND last_updated > now() - interval '${STATS_TTL_HOURS} hours'`,
    [userId]
  );

  if (cached.rows.length) {
    console.debug('✅ Using cached stats for user:', userId);
    return {
      followers: cached.rows[0].followers || {},
      ccv: cached.rows[0].ccv || {},
      engagement: cached.rows[0].engagement || {},
      marketability: cached.rows[0].marketability || 'F',
      last_updated: cached.rows[0].last_updated
    };
  }

  // Custom scraper layer (Kick + others)
  const platforms = { instagram, tiktok, x, youtube, facebook, kick, twitch }; // ✅ Twitch added here
  for (const [platform, rawHandle] of Object.entries(platforms)) {
    const handle = sanitize(rawHandle);
    if (!handle) continue;

    try {
      console.debug(`🔍 Scraping ${platform} for handle: ${handle}`);
      const result = await getStatsFromPlatform(platform, handle);

      if (result) {
        if (result.followers != null) {
          stats.followers[platform] = Number(result.followers) || 0;
        }
        if (result.engagement != null) {
          stats.engagement[platform] = Number(result.engagement) || 0;
        }
        if (result.ccv != null) {
          stats.ccv[platform] = Number(result.ccv) || 0;
        }
        stats.apiStatus[platform] = 'ok';
      } else {
        stats.apiStatus[platform] = 'fail';
      }
    } catch (err) {
      console.warn(`⚠️ ${platform} stats failed:`, err.message);
      stats.apiStatus[platform] = 'fail';
    }
  }

  const marketability = gradeMarketability(stats);

  // Cache results safely
  try {
    const isValidJson = obj => obj && typeof obj === 'object' && !Array.isArray(obj);

    const safeFollowers = isValidJson(stats.followers) ? stats.followers : {};
    const safeCCV = isValidJson(stats.ccv) ? stats.ccv : {};
    const safeEngagement = isValidJson(stats.engagement) ? stats.engagement : {};
    const safeMarketability = typeof marketability === 'string' ? marketability : 'F';

    console.debug('📦 Caching stats for user:', userId);
    console.debug('Payload:', {
      followers: safeFollowers,
      ccv: safeCCV,
      engagement: safeEngagement,
      marketability: safeMarketability
    });

    await db.query(
      `INSERT INTO user_stats (user_id, followers, ccv, engagement, marketability, last_updated)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE SET
         followers = $2,
         ccv = $3,
         engagement = $4,
         marketability = $5,
         last_updated = now()`,
      [userId, safeFollowers, safeCCV, safeEngagement, safeMarketability]
    );
  } catch (err) {
    console.error('❌ Failed to cache stats for user:', userId);
    console.error('Stats payload:', {
      followers: stats.followers,
      ccv: stats.ccv,
      engagement: stats.engagement,
      marketability
    });
    console.error('DB error:', err);
  }

  return { ...stats, marketability };
}


export function gradeMarketability({ followers = {}, ccv = {}, engagement = {} }) {
  const toNumber = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const reach = Object.values(followers).reduce((total, value) => total + toNumber(value), 0);
  const totalCCV = Object.values(ccv).reduce((total, value) => total + toNumber(value), 0);
  const totalEngagement = Object.values(engagement).reduce((total, value) => total + toNumber(value), 0);
  const avgCCV = Object.keys(ccv).length ? totalCCV / Object.keys(ccv).length : 0;
  const avgEngagement = Object.keys(engagement).length ? totalEngagement / Object.keys(engagement).length : 0;

  const score = reach * 0.5 + avgCCV * 2 + avgEngagement * 100;

  if (score > 1000000) return 'A';
  if (score > 500000) return 'B';
  if (score > 100000) return 'C';
  if (score > 25000) return 'D';
  return 'F';
}
