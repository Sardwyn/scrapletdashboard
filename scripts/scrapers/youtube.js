import fetch from 'node-fetch';

const API_KEY = process.env.YOUTUBE_API_KEY;

function sanitize(handle) {
  if (!handle) return null;
  const cleaned = handle.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const match = cleaned.match(/youtube\.com\/(?:channel\/|@)?([^\/]+)/);
  return match ? match[1] : cleaned;
}

export async function getStats(rawHandle) {
  const handle = sanitize(rawHandle);
  if (!handle || !API_KEY) {
    console.warn(`⚠️ YouTube scrape skipped: invalid handle or missing API key`);
    return null;
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&forUsername=${handle}&key=${API_KEY}`;
    const fallbackUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${handle}&key=${API_KEY}`;

    let res = await fetch(url);
    let data = await res.json();

    // If no items, try fallback with channel ID
    if (!data.items?.length) {
      res = await fetch(fallbackUrl);
      data = await res.json();
    }

    const stats = data.items?.[0]?.statistics;
    if (!stats) throw new Error('No statistics found');

    const followers = parseInt(stats.subscriberCount || '0', 10);
    const engagement = parseInt(stats.commentCount || '0', 10);

    console.debug(`[YouTube API] ${handle}: ${followers} subs, ${engagement} comments`);

    return {
      followers,
      ccv: 0,
      engagement
    };
  } catch (err) {
    console.warn(`⚠️ YouTube API failed for ${handle}:`, err.message);
    return null;
  }
}
