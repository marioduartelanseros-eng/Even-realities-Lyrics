import {
  loginWithSpotify,
  handleCallback,
  isLoggedIn,
  getNowPlaying,
  getAccessToken,
  type NowPlaying,
} from './spotify';
import { fetchLyrics, type LyricsResult } from './lyrics';
import { getCurrentLineIndex, type LrcLine } from './lrc-parser';
import { initGlasses, displayLyricOnGlasses, setRingActionHandler } from './glasses';

// --- State ---
let currentTrackId: string | null = null;
let lyrics: LrcLine[] = [];
let plainLyrics: string | null = null;
let lastNowPlaying: NowPlaying | null = null;
let localProgressMs = 0;
let lastLineIndex = -1;
let progressInterval: ReturnType<typeof setInterval> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let isCurrentlyPlaying = false;
let lyricsLoading = false;
let noLyricsFound = false;

// --- DOM refs ---
const screenLogin = document.getElementById('screen-login')!;
const screenPlayer = document.getElementById('screen-player')!;
const btnLogin = document.getElementById('btn-spotify-login')!;
const albumArt = document.getElementById('album-art') as HTMLImageElement;
const trackName = document.getElementById('track-name')!;
const artistName = document.getElementById('artist-name')!;
const progressFill = document.getElementById('progress-fill')!;
const timeCurrent = document.getElementById('time-current')!;
const timeTotal = document.getElementById('time-total')!;
const lyricPrev = document.getElementById('lyric-prev')!;
const lyricCurrent = document.getElementById('lyric-current')!;
const lyricNext = document.getElementById('lyric-next')!;

// --- Helpers ---
function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function showScreen(screen: 'login' | 'player'): void {
  screenLogin.classList.toggle('active', screen === 'login');
  screenPlayer.classList.toggle('active', screen === 'player');
}

// --- Glasses display helpers ---
function sendToGlasses(
  current: string,
  next?: string,
  prev?: string,
): void {
  const progressPct = lastNowPlaying
    ? Math.min(100, (localProgressMs / lastNowPlaying.durationMs) * 100)
    : undefined;

  displayLyricOnGlasses(
    current,
    next,
    prev,
    lastNowPlaying?.trackName,
    lastNowPlaying?.artistName,
    lastNowPlaying?.albumArt,
    progressPct,
    localProgressMs,
    lastNowPlaying?.durationMs,
  );
}

function showGlassesIdle(): void {
  displayLyricOnGlasses(
    'No music playing',
    'Play something on Spotify',
    '',
    'LyricLens',
    'Ready',
    undefined,
    0,
    0,
    0,
  );
}

function showGlassesPaused(): void {
  const current = lyrics.length > 0 && lastLineIndex >= 0
    ? lyrics[lastLineIndex].text
    : '';
  const next = lyrics.length > 0 && lastLineIndex + 1 < lyrics.length
    ? lyrics[lastLineIndex + 1].text
    : '';
  const prev = lyrics.length > 0 && lastLineIndex > 0
    ? lyrics[lastLineIndex - 1].text
    : '';

  displayLyricOnGlasses(
    current || '-- Paused --',
    next,
    prev,
    lastNowPlaying ? `${lastNowPlaying.trackName} (Paused)` : 'LyricLens',
    lastNowPlaying?.artistName,
    lastNowPlaying?.albumArt,
    lastNowPlaying ? Math.min(100, (localProgressMs / lastNowPlaying.durationMs) * 100) : 0,
    localProgressMs,
    lastNowPlaying?.durationMs,
  );
}

function showGlassesLoading(): void {
  sendToGlasses('Loading lyrics...', '', '');
}

function showGlassesNoLyrics(): void {
  if (plainLyrics) {
    // Show first few lines of plain lyrics
    const lines = plainLyrics.split('\n').filter(l => l.trim());
    sendToGlasses(
      lines[0] || 'Lyrics available (not synced)',
      lines[1] || '',
      '',
    );
  } else {
    sendToGlasses('No lyrics found', 'Try another song', '');
  }
}

// --- Lyrics display ---
function updateLyricsDisplay(): void {
  if (lyricsLoading) return;

  if (lyrics.length === 0) {
    if (!noLyricsFound) return; // still loading
    if (plainLyrics) {
      lyricCurrent.textContent = 'Lyrics available (not synced)';
      lyricPrev.textContent = '';
      lyricNext.textContent = plainLyrics.split('\n').slice(0, 2).join(' ');
      showGlassesNoLyrics();
    } else {
      lyricCurrent.textContent = 'No lyrics found';
      lyricPrev.textContent = '';
      lyricNext.textContent = '';
      showGlassesNoLyrics();
    }
    return;
  }

  const idx = getCurrentLineIndex(lyrics, localProgressMs);
  if (idx === lastLineIndex) return;
  lastLineIndex = idx;

  const prev = idx > 0 ? lyrics[idx - 1].text : '';
  const current = idx >= 0 ? lyrics[idx].text : '';
  const next = idx + 1 < lyrics.length ? lyrics[idx + 1].text : '';

  lyricPrev.textContent = prev;
  lyricCurrent.textContent = current;
  lyricNext.textContent = next;

  sendToGlasses(current, next, prev);
}

function updateProgress(): void {
  if (!lastNowPlaying) return;
  const pct = Math.min(100, (localProgressMs / lastNowPlaying.durationMs) * 100);
  progressFill.style.width = pct + '%';
  timeCurrent.textContent = formatTime(localProgressMs);
  timeTotal.textContent = formatTime(lastNowPlaying.durationMs);
}

// --- Reset state for new track ---
function resetLyricsState(): void {
  currentTrackId = null;
  lyrics = [];
  plainLyrics = null;
  lastLineIndex = -1;
  lyricsLoading = false;
  noLyricsFound = false;
}

// --- Polling loop ---
async function onTrackUpdate(np: NowPlaying): Promise<void> {
  // Update UI
  trackName.textContent = np.trackName;
  artistName.textContent = np.artistName;
  if (np.albumArt) albumArt.src = np.albumArt;

  // Handle pause/play state change
  const wasPlaying = isCurrentlyPlaying;
  isCurrentlyPlaying = np.isPlaying;

  // Sync local progress with Spotify
  localProgressMs = np.progressMs + (Date.now() - np.timestamp);
  lastNowPlaying = np;

  // If paused, update glasses and stop
  if (!np.isPlaying) {
    showGlassesPaused();
    return;
  }

  // If resumed from pause, force a lyrics update
  if (!wasPlaying && np.isPlaying) {
    lastLineIndex = -1; // force refresh
  }

  // If new track, fetch lyrics
  if (np.trackId !== currentTrackId) {
    currentTrackId = np.trackId;
    lastLineIndex = -1;
    lyrics = [];
    plainLyrics = null;
    lyricsLoading = true;
    noLyricsFound = false;

    // Update phone UI
    lyricCurrent.textContent = 'Loading lyrics...';
    lyricPrev.textContent = '';
    lyricNext.textContent = '';

    // Update glasses
    showGlassesLoading();

    const result: LyricsResult = await fetchLyrics(
      np.trackName,
      np.artistName,
      np.albumName,
      np.durationMs / 1000
    );

    // Verify track hasn't changed while we were fetching
    if (currentTrackId === np.trackId) {
      lyricsLoading = false;
      if (result.synced && result.synced.length > 0) {
        lyrics = result.synced;
        noLyricsFound = false;
        lyricCurrent.textContent = '';
      } else if (result.plain) {
        plainLyrics = result.plain;
        noLyricsFound = true;
      } else {
        noLyricsFound = true;
      }
    }
  }
}

async function pollSpotify(): Promise<void> {
  const np = await getNowPlaying();
  if (np) {
    await onTrackUpdate(np);
  } else {
    // Nothing playing
    if (isCurrentlyPlaying || lastNowPlaying !== null) {
      isCurrentlyPlaying = false;
      trackName.textContent = 'No track playing';
      artistName.textContent = 'Play something on Spotify';
      lyricCurrent.textContent = 'Waiting for music...';
      lyricPrev.textContent = '';
      lyricNext.textContent = '';
      progressFill.style.width = '0%';
      timeCurrent.textContent = '0:00';
      timeTotal.textContent = '0:00';
      resetLyricsState();
      lastNowPlaying = null;
      showGlassesIdle();
    }
  }
}

function startPolling(): void {
  // Poll Spotify every 3 seconds
  pollSpotify();
  pollInterval = setInterval(pollSpotify, 3000);

  // Update local progress + lyrics every 100ms
  progressInterval = setInterval(() => {
    if (isCurrentlyPlaying && lastNowPlaying) {
      localProgressMs += 100;
      updateProgress();
      updateLyricsDisplay();
    }
  }, 100);
}

// --- Ring controller ---
function setupRingController(): void {
  setRingActionHandler(async (action) => {
    console.log('Ring action:', action);
    const token = getAccessToken();
    if (!token) return;

    try {
      if (action === 'click') {
        // Toggle playback
        if (isCurrentlyPlaying) {
          await fetch('https://api.spotify.com/v1/me/player/pause', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
          });
        } else {
          await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } else if (action === 'next') {
        await fetch('https://api.spotify.com/v1/me/player/next', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } else if (action === 'prev') {
        await fetch('https://api.spotify.com/v1/me/player/previous', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      // Force an immediate poll to update UI
      setTimeout(pollSpotify, 500);
    } catch (e) {
      console.error('Ring action failed:', e);
    }
  });
}

// --- Init ---
async function init(): Promise<void> {
  // Check for OAuth callback
  if (window.location.search.includes('code=')) {
    const success = await handleCallback();
    if (success) {
      showScreen('player');
      initGlasses();
      setupRingController();
      startPolling();
      return;
    }
  }

  // Check for existing session
  if (isLoggedIn()) {
    showScreen('player');
    initGlasses();
    setupRingController();
    startPolling();
    return;
  }

  // Show login
  showScreen('login');
  btnLogin.addEventListener('click', () => loginWithSpotify());
}

init();
