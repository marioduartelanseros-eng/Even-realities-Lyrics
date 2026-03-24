import { parseLRC, type LrcLine } from './lrc-parser';

export interface LyricsResult {
  synced: LrcLine[] | null;
  plain:  string   | null;
}

// ── Cache ──────────────────────────────────────────────────────────────────
const CACHE_PREFIX = 'llc_'; // lyriclens cache
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadFromCache(trackId: string): LyricsResult | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + trackId);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.t > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + trackId);
      return null;
    }
    console.log('[lyrics] Cache hit');
    return { synced: entry.s ?? null, plain: entry.p ?? null };
  } catch {
    return null;
  }
}

function saveToCache(trackId: string, result: LyricsResult): void {
  try {
    localStorage.setItem(CACHE_PREFIX + trackId, JSON.stringify({
      s: result.synced,
      p: result.plain,
      t: Date.now(),
    }));
  } catch {
    // localStorage full or unavailable — skip silently
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function primaryArtist(artistName: string): string {
  return artistName.split(/,|&| feat\.? | ft\.? /i)[0].trim();
}

// ── LRCLIB ─────────────────────────────────────────────────────────────────
async function fetchFromLrclib(
  trackName:   string,
  artistName:  string,
  albumName:   string,
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
    console.log('[lyrics] LRCLIB results:', Array.isArray(results) ? results.length : 'not array');
    if (!Array.isArray(results) || results.length === 0) return null;

    const best = results.find((r: any) => r.syncedLyrics) ?? results[0];
    return {
      synced: best.syncedLyrics ? parseLRC(best.syncedLyrics) : null,
      plain:  best.plainLyrics  || null,
    };
  } catch (err) {
    console.error('[lyrics] LRCLIB error:', err);
    return null;
  }
}

// ── lyrics.ovh fallback ────────────────────────────────────────────────────
async function fetchFromLyricsOvh(
  trackName:  string,
  artistName: string,
): Promise<string | null> {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist(artistName))}/${encodeURIComponent(trackName)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.lyrics || null;
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────
export async function fetchLyrics(
  trackId:     string, // used for caching
  trackName:   string,
  artistName:  string,
  albumName:   string,
  durationSec: number,
): Promise<LyricsResult> {
  // Return cached result immediately if available
  const cached = loadFromCache(trackId);
  if (cached) return cached;

  console.log('[lyrics] Fetching:', trackName, 'by', artistName);

  // Run both APIs in parallel — prefer synced > plain > nothing
  const [lrclib, ovhPlain] = await Promise.all([
    fetchFromLrclib(trackName, artistName, albumName, durationSec),
    fetchFromLyricsOvh(trackName, artistName),
  ]);

  let result: LyricsResult;

  if (lrclib?.synced && lrclib.synced.length > 0) {
    console.log('[lyrics] Using LRCLIB synced');
    result = lrclib;
  } else if (lrclib?.plain) {
    console.log('[lyrics] Using LRCLIB plain');
    result = { synced: null, plain: lrclib.plain };
  } else if (ovhPlain) {
    console.log('[lyrics] Using lyrics.ovh plain');
    result = { synced: null, plain: ovhPlain };
  } else {
    console.warn('[lyrics] No lyrics found for:', trackName);
    result = { synced: null, plain: null };
  }

  saveToCache(trackId, result);
  return result;
}
