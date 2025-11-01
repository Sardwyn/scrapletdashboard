import fetch from 'node-fetch';

const API_KEY = process.env.YOUTUBE_API_KEY; // or hardcode for testing

function sanitize(handle) {
  if (!handle) return null;
  const cleaned = handle.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const match = cleaned.match(/youtube\.com\/@([^\/]+)/);
  return match ? match[1] : cleaned;
}

export async function getStats(rawHandle) {
  const handle = sanitize(rawHandle);
  if (!handle) {
    console.warn(`⚠️ YouTube scrape skipped: invalid handle "${rawHandle}"`);
    return null;
  }

  try {
    // Step 1: Get channel ID from handle
    const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${handle}&key=${API_KEY}`);
    const searchData = await searchRes.json();
    const channelId = searchData.items?.[0]?.snippet?.channelId;

    if (!channelId) {
      console.warn(`⚠️ YouTube channel not found for ${handle}`);
      return null;
    }

    // Step 2: Get channel stats
    const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${API_KEY}`);
    const statsData = await statsRes.json();
    const subs = statsData.items?.[0]?.statistics?.subscriberCount;

    const subscribers = subs ? parseInt(subs, 10) : 0;
    console.debug(`[YouTube] ${handle}: ${subscribers} subscribers`);

    return { followers: subscribers, ccv: 0, engagement: 0 };
  } catch (err) {
    console.warn(`⚠️ YouTube API failed for ${handle}:`, err.message);
    return null;
  }
}
