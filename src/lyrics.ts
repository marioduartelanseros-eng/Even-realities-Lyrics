import { parseLRC, type LrcLine } from './lrc-parser';

export interface LyricsResult {
  synced: LrcLine[] | null;
  plain: string | null;
}

/** Use only the primary artist name (before comma/&/feat) for better API matching */
function primaryArtist(artistName: string): string {
  return artistName.split(/,|&| feat\.? | ft\.? /i)[0].trim();
}

async function fetchFromLrclib(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSec: number,
): Promise<LyricsResult | null> {
  const artist = primaryArtist(artistName);
  try {
    // 1. Exact match
    const exactUrl = 'https://lrclib.net/api/get?' + new URLSearchParams({
      artist_name: artist,
      track_name:  trackName,
      album_name:  albumName,
      duration:    String(Math.round(durationSec)),
    });
    console.log('[lyrics] LRCLIB exact:', exactUrl);
    const exactRes = await fetch(exactUrl);
    console.log('[lyrics] LRCLIB exact status:', exactRes.status);
    if (exactRes.ok) {
      const data = await exactRes.json();
      if (data.syncedLyrics || data.plainLyrics) {
        console.log('[lyrics] LRCLIB exact match found');
        return {
          synced: data.syncedLyrics ? parseLRC(data.syncedLyrics) : null,
          plain:  data.plainLyrics  || null,
        };
      }
    }

    // 2. Search fallback
    const searchUrl = 'https://lrclib.net/api/search?' + new URLSearchParams({
      track_name:  trackName,
      artist_name: artist,
    });
    console.log('[lyrics] LRCLIB search:', searchUrl);
    const searchRes = await fetch(searchUrl);
    console.log('[lyrics] LRCLIB search status:', searchRes.status);
    if (!searchRes.ok) return null;

    const results = await searchRes.json();
    console.log('[lyrics] LRCLIB search results count:', Array.isArray(results) ? results.length : 'not array');
    if (!Array.isArray(results) || results.length === 0) return null;

    const best = results.find((r: any) => r.syncedLyrics) ?? results[0];
    console.log('[lyrics] LRCLIB best result synced:', !!best.syncedLyrics, 'plain:', !!best.plainLyrics);
    return {
      synced: best.syncedLyrics ? parseLRC(best.syncedLyrics) : null,
      plain:  best.plainLyrics  || null,
    };
  } catch (err) {
    console.error('[lyrics] LRCLIB fetch error:', err);
    return null;
  }
}

async function fetchFromLyricsOvh(
  trackName: string,
  artistName: string,
): Promise<string | null> {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist(artistName))}/${encodeURIComponent(trackName)}`;
    console.log('[lyrics] lyrics.ovh:', url);
    const res = await fetch(url);
    console.log('[lyrics] lyrics.ovh status:', res.status);
    if (!res.ok) return null;
    const data = await res.json();
    return data.lyrics || null;
  } catch (err) {
    console.error('[lyrics] lyrics.ovh fetch error:', err);
    return null;
  }
}

export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSec: number,
): Promise<LyricsResult> {
  console.log('[lyrics] Fetching for:', trackName, 'by', artistName);

  // Run both APIs in parallel — take whichever returns synced lyrics first
  const [lrclibResult, ovhPlain] = await Promise.all([
    fetchFromLrclib(trackName, artistName, albumName, durationSec),
    fetchFromLyricsOvh(trackName, artistName),
  ]);

  // Prefer LRCLIB synced > LRCLIB plain > lyrics.ovh plain
  if (lrclibResult?.synced && lrclibResult.synced.length > 0) {
    console.log('[lyrics] Using LRCLIB synced lyrics');
    return lrclibResult;
  }
  if (lrclibResult?.plain) {
    console.log('[lyrics] Using LRCLIB plain lyrics');
    return { synced: null, plain: lrclibResult.plain };
  }
  if (ovhPlain) {
    console.log('[lyrics] Using lyrics.ovh plain lyrics');
    return { synced: null, plain: ovhPlain };
  }

  console.warn('[lyrics] No lyrics found for:', trackName, artistName);
  return { synced: null, plain: null };
}
