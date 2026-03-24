import { parseLRC, type LrcLine } from './lrc-parser';

export interface LyricsResult {
  synced: LrcLine[] | null;
  plain: string | null;
}

/**
 * Return just the primary artist name (before any comma / feat.)
 * to improve API match rates.
 */
function primaryArtist(artistName: string): string {
  return artistName.split(/[,&]/)[0].trim();
}

/**
 * Fetch synced (and plain) lyrics from LRCLIB.
 * No API key required. CORS-enabled.
 */
async function fetchFromLrclib(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSec: number,
): Promise<LyricsResult | null> {
  try {
    // 1. Exact match (needs album + duration)
    const exactUrl =
      'https://lrclib.net/api/get?' +
      new URLSearchParams({
        artist_name: primaryArtist(artistName),
        track_name:  trackName,
        album_name:  albumName,
        duration:    String(Math.round(durationSec)),
      });

    let res = await fetch(exactUrl);

    if (res.ok) {
      const data = await res.json();
      if (data.syncedLyrics || data.plainLyrics) {
        return {
          synced: data.syncedLyrics ? parseLRC(data.syncedLyrics) : null,
          plain:  data.plainLyrics  ?? null,
        };
      }
    }

    // 2. Search fallback (more lenient, no album/duration needed)
    const searchUrl =
      'https://lrclib.net/api/search?' +
      new URLSearchParams({
        track_name:  trackName,
        artist_name: primaryArtist(artistName),
      });

    res = await fetch(searchUrl);
    if (!res.ok) return null;

    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const best = results.find((r: any) => r.syncedLyrics) ?? results[0];
    return {
      synced: best.syncedLyrics ? parseLRC(best.syncedLyrics) : null,
      plain:  best.plainLyrics  ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch plain lyrics from lyrics.ovh as a fallback.
 * Free, no API key, CORS-enabled.
 */
async function fetchFromLyricsOvh(
  trackName: string,
  artistName: string,
): Promise<string | null> {
  try {
    const artist = encodeURIComponent(primaryArtist(artistName));
    const title  = encodeURIComponent(trackName);
    const res = await fetch(`https://api.lyrics.ovh/v1/${artist}/${title}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.lyrics ?? null;
  } catch {
    return null;
  }
}

/**
 * Main entry point — tries LRCLIB first, falls back to lyrics.ovh.
 */
export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSec: number,
): Promise<LyricsResult> {
  // Try LRCLIB (synced + plain)
  const lrclibResult = await fetchFromLrclib(trackName, artistName, albumName, durationSec);
  if (lrclibResult && (lrclibResult.synced || lrclibResult.plain)) {
    return lrclibResult;
  }

  // Fallback: lyrics.ovh (plain only)
  const plain = await fetchFromLyricsOvh(trackName, artistName);
  if (plain) {
    return { synced: null, plain };
  }

  return { synced: null, plain: null };
}
