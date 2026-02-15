import { parseLRC, type LrcLine } from './lrc-parser';

export interface LyricsResult {
  synced: LrcLine[] | null;
  plain: string | null;
}

/**
 * Fetch synced lyrics from LRCLIB (free, no API key needed).
 */
export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSec: number
): Promise<LyricsResult> {
  // Try exact match first
  const exactUrl = 'https://lrclib.net/api/get?' + new URLSearchParams({
    artist_name: artistName,
    track_name: trackName,
    album_name: albumName,
    duration: String(Math.round(durationSec)),
  });

  try {
    let response = await fetch(exactUrl, {
      headers: { 'User-Agent': 'LyricLens v1.0.0' },
    });

    // If exact match fails, try search
    if (!response.ok) {
      const searchUrl = 'https://lrclib.net/api/search?' + new URLSearchParams({
        track_name: trackName,
        artist_name: artistName,
      });
      response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'LyricLens v1.0.0' },
      });

      if (!response.ok) {
        return { synced: null, plain: null };
      }

      const results = await response.json();
      if (!Array.isArray(results) || results.length === 0) {
        return { synced: null, plain: null };
      }

      // Use the first result that has synced lyrics
      const withSynced = results.find((r: any) => r.syncedLyrics);
      const best = withSynced || results[0];

      return {
        synced: best.syncedLyrics ? parseLRC(best.syncedLyrics) : null,
        plain: best.plainLyrics || null,
      };
    }

    const data = await response.json();
    return {
      synced: data.syncedLyrics ? parseLRC(data.syncedLyrics) : null,
      plain: data.plainLyrics || null,
    };
  } catch (err) {
    console.error('Failed to fetch lyrics:', err);
    return { synced: null, plain: null };
  }
}
