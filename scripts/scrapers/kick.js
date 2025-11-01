import fetch from 'node-fetch';

export async function getStats(handle) {
  try {
    const url = `https://kick.com/api/v1/channels/${handle}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Kick API returned ${res.status}`);
    const data = await res.json();

    const followers = data.followersCount || 0;
    const ccv = data.livestream?.viewer_count || 0;

    console.debug(`[Kick API] ${handle}: ${followers} followers, ${ccv} viewers`);

    return {
      followers,
      ccv,
      engagement: 0
    };
  } catch (err) {
    console.warn(`⚠️ Kick API failed for ${handle}:`, err.message);
    return null;
  }
}
