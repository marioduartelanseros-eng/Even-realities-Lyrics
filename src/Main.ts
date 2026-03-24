import {
  loginWithSpotify,
  handleCallback,
  isLoggedIn,
  getNowPlaying,
  getAuthorizedAccessToken,
  clearSpotifySession,
  type NowPlaying,
} from './spotify';
import { fetchLyrics, type LyricsResult } from './lyrics';
import { getCurrentLineIndex, type LrcLine } from './lrc-parser';
import { initGlasses, displayLyricOnGlasses, setRingActionHandler } from './glasses';
import {
  isAmbientRecognitionConfigured,
  recognizeAmbientTrack,
  type RecognizedTrack,
} from './music-recognition';
import {
  getAuddApiToken,
  getSpotifyClientId,
  getSpotifyRedirectUri,
  getStoredAuddApiToken,
  getStoredSpotifyClientId,
  setAuddApiToken,
  setSpotifyClientId,
} from './runtime-config';

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
let currentSource: 'spotify' | 'ambient' | null = null;
let isAmbientRecognitionRunning = false;
let lastAmbientRecognitionAt = 0;
let ambientMicPromptDenied = false;

// --- DOM refs ---
const screenLogin   = document.getElementById('screen-login')!;
const screenPlayer  = document.getElementById('screen-player')!;
const btnLogin      = document.getElementById('btn-spotify-login')!;
const loginHint     = document.querySelector('#screen-login .hint') as HTMLElement | null;
const spotifyClientIdInput  = document.getElementById('spotify-client-id')  as HTMLInputElement | null;
const auddApiTokenInput     = document.getElementById('audd-api-token')      as HTMLInputElement | null;
const btnSaveSettings       = document.getElementById('btn-save-settings')   as HTMLButtonElement | null;
const spotifyRedirectUriText = document.getElementById('spotify-redirect-uri');
const albumArtEl    = document.getElementById('album-art')     as HTMLImageElement;
const trackNameEl   = document.getElementById('track-name')!;
const artistNameEl  = document.getElementById('artist-name')!;
const progressFill  = document.getElementById('progress-fill')!;
const timeCurrent   = document.getElementById('time-current')!;
const timeTotal     = document.getElementById('time-total')!;
const lyricsScroll  = document.getElementById('lyrics-scroll')!;

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

// --- Phone lyrics display helpers ---

/** Show a plain status message (loading, no lyrics, etc.) */
function setLyricsStatus(msg: string): void {
  lyricsScroll.innerHTML = `<p class="lyric-status">${msg}</p>`;
}

/** Render all synced lyric lines into the scroll container */
function renderLyricsLines(lines: LrcLine[]): void {
  lyricsScroll.innerHTML = '';
  lines.forEach((line) => {
    const p = document.createElement('p');
    p.className = 'lyric-line';
    p.textContent = line.text || '♪';
    lyricsScroll.appendChild(p);
  });
}

/** Render plain (non-synced) lyrics — all lines equally visible */
function renderPlainLyrics(text: string): void {
  lyricsScroll.innerHTML = '';
  text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .forEach(line => {
      const p = document.createElement('p');
      p.className = 'lyric-line near';
      p.textContent = line;
      lyricsScroll.appendChild(p);
    });
}

/** Highlight the current line and smooth-scroll it to the centre */
function highlightLyricLine(idx: number): void {
  const lines = lyricsScroll.querySelectorAll<HTMLElement>('.lyric-line');
  lines.forEach((el, i) => {
    el.classList.remove('current', 'near');
    const dist = Math.abs(i - idx);
    if (dist === 0)      el.classList.add('current');
    else if (dist <= 2)  el.classList.add('near');
  });
  if (idx >= 0 && idx < lines.length) {
    lines[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// --- Glasses display helpers ---
function sendToGlasses(current: string, next?: string, prev?: string): void {
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
  const subtitle = isAmbientRecognitionConfigured()
    ? 'Play from Spotify or nearby audio'
    : 'Play something on Spotify';
  displayLyricOnGlasses('No music playing', subtitle, '', 'LyricLens', 'Ready', undefined, 0, 0, 0);
}

function showGlassesPaused(): void {
  const current = lyrics.length > 0 && lastLineIndex >= 0 ? lyrics[lastLineIndex].text : '';
  const next    = lyrics.length > 0 && lastLineIndex + 1 < lyrics.length ? lyrics[lastLineIndex + 1].text : '';
  const prev    = lyrics.length > 0 && lastLineIndex > 0                 ? lyrics[lastLineIndex - 1].text : '';

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

function showGlassesNoLyrics(): void {
  if (plainLyrics) {
    const lines = plainLyrics.split('\n').filter(l => l.trim());
    sendToGlasses(lines[0] || 'Lyrics available (not synced)', lines[1] || '', '');
  } else {
    sendToGlasses('No lyrics found', 'Try another song', '');
  }
}

// --- Lyrics display ---
function updateLyricsDisplay(): void {
  if (lyricsLoading) return;
  if (lyrics.length === 0) return; // state already set in onTrackUpdate

  const idx = getCurrentLineIndex(lyrics, localProgressMs);
  if (idx === lastLineIndex) return;
  lastLineIndex = idx;

  highlightLyricLine(idx);

  const current = idx >= 0             ? lyrics[idx].text     : '';
  const next    = idx + 1 < lyrics.length ? lyrics[idx + 1].text : '';
  const prev    = idx > 0              ? lyrics[idx - 1].text  : '';
  sendToGlasses(current, next, prev);
}

function updateProgress(): void {
  if (!lastNowPlaying) return;
  const pct = Math.min(100, (localProgressMs / lastNowPlaying.durationMs) * 100);
  progressFill.style.width = pct + '%';
  timeCurrent.textContent = formatTime(localProgressMs);
  timeTotal.textContent   = formatTime(lastNowPlaying.durationMs);
}

// --- Reset state for new track ---
function resetLyricsState(): void {
  currentTrackId = null;
  lyrics         = [];
  plainLyrics    = null;
  lastLineIndex  = -1;
  lyricsLoading  = false;
  noLyricsFound  = false;
  currentSource  = null;
}

// --- Polling loop ---
async function onTrackUpdate(np: NowPlaying, source: 'spotify' | 'ambient' = 'spotify'): Promise<void> {
  currentSource = source;

  // Update phone UI
  trackNameEl.textContent  = np.trackName;
  artistNameEl.textContent = source === 'ambient' ? `${np.artistName} (ambient)` : np.artistName;
  albumArtEl.src           = np.albumArt || '';

  const wasPlaying   = isCurrentlyPlaying;
  isCurrentlyPlaying = np.isPlaying;

  localProgressMs = np.progressMs + (Date.now() - np.timestamp);
  lastNowPlaying  = np;

  if (!np.isPlaying) {
    showGlassesPaused();
    return;
  }

  if (!wasPlaying && np.isPlaying) {
    lastLineIndex = -1; // force refresh on resume
  }

  // New track → fetch lyrics
  if (np.trackId !== currentTrackId) {
    currentTrackId = np.trackId;
    lastLineIndex  = -1;
    lyrics         = [];
    plainLyrics    = null;
    lyricsLoading  = true;
    noLyricsFound  = false;

    setLyricsStatus('Loading lyrics...');
    showGlassesIdle(); // show "Loading lyrics..." while waiting

    const result: LyricsResult = await fetchLyrics(
      np.trackId,
      np.trackName,
      np.artistName,
      np.albumName,
      np.durationMs / 1000,
    );

    // Guard: track may have changed while we were fetching
    if (currentTrackId !== np.trackId) return;

    lyricsLoading = false;

    if (result.synced && result.synced.length > 0) {
      lyrics = result.synced;
      noLyricsFound = false;
      renderLyricsLines(lyrics);
      // Immediately highlight where we are
      const idx = getCurrentLineIndex(lyrics, localProgressMs);
      lastLineIndex = idx;
      highlightLyricLine(idx);
      const current = idx >= 0             ? lyrics[idx].text     : '';
      const next    = idx + 1 < lyrics.length ? lyrics[idx + 1].text : '';
      const prev    = idx > 0              ? lyrics[idx - 1].text  : '';
      sendToGlasses(current, next, prev);
    } else if (result.plain) {
      plainLyrics   = result.plain;
      noLyricsFound = true;
      renderPlainLyrics(result.plain);
      showGlassesNoLyrics();
    } else {
      noLyricsFound = true;
      setLyricsStatus('No lyrics found');
      showGlassesNoLyrics();
    }
  }
}

async function pollSpotify(): Promise<void> {
  const np = await getNowPlaying();
  if (np) {
    await onTrackUpdate(np, 'spotify');
    return;
  }

  const ambientTrack = await tryRecognizeAmbientTrack();
  if (ambientTrack) {
    const nowPlayingAmbient: NowPlaying = {
      trackId:    `ambient:${ambientTrack.trackId}`,
      trackName:  ambientTrack.trackName,
      artistName: ambientTrack.artistName,
      albumName:  ambientTrack.albumName,
      albumArt:   ambientTrack.albumArt,
      durationMs: ambientTrack.durationMs,
      progressMs: ambientTrack.progressMs,
      isPlaying:  true,
      timestamp:  Date.now(),
    };
    await onTrackUpdate(nowPlayingAmbient, 'ambient');
    return;
  }

  // Nothing playing
  if (isCurrentlyPlaying || lastNowPlaying !== null) {
    isCurrentlyPlaying = false;
    trackNameEl.textContent  = 'No track playing';
    artistNameEl.textContent = isAmbientRecognitionConfigured()
      ? 'Play Spotify or enable nearby audio'
      : 'Play something on Spotify';
    setLyricsStatus(isAmbientRecognitionConfigured()
      ? 'Waiting for Spotify or ambient match...'
      : 'Waiting for music...');
    progressFill.style.width = '0%';
    timeCurrent.textContent  = '0:00';
    timeTotal.textContent    = '0:00';
    resetLyricsState();
    lastNowPlaying = null;
    showGlassesIdle();
  }
}

async function tryRecognizeAmbientTrack(): Promise<RecognizedTrack | null> {
  if (!isAmbientRecognitionConfigured()) return null;
  if (ambientMicPromptDenied)            return null;
  if (isAmbientRecognitionRunning)       return null;

  const now = Date.now();
  const minGapMs = currentSource === 'ambient' ? 15000 : 25000;
  if (now - lastAmbientRecognitionAt < minGapMs) return null;

  isAmbientRecognitionRunning  = true;
  lastAmbientRecognitionAt     = now;
  try {
    return await recognizeAmbientTrack();
  } catch (err) {
    const asError = err instanceof Error ? err : null;
    if (asError?.name === 'NotAllowedError') {
      ambientMicPromptDenied = true;
      console.warn('Microphone permission denied; ambient recognition disabled for this session.');
    }
    return null;
  } finally {
    isAmbientRecognitionRunning = false;
  }
}

function startPolling(): void {
  pollSpotify();
  pollInterval = setInterval(pollSpotify, 3000);

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
    const token = await getAuthorizedAccessToken();
    if (!token) return;

    try {
      if (action === 'click') {
        if (isCurrentlyPlaying) {
          await fetch('https://api.spotify.com/v1/me/player/pause', {
            method: 'PUT', headers: { Authorization: `Bearer ${token}` },
          });
        } else {
          await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT', headers: { Authorization: `Bearer ${token}` },
          });
        }
      } else if (action === 'next') {
        await fetch('https://api.spotify.com/v1/me/player/next', {
          method: 'POST', headers: { Authorization: `Bearer ${token}` },
        });
      } else if (action === 'prev') {
        await fetch('https://api.spotify.com/v1/me/player/previous', {
          method: 'POST', headers: { Authorization: `Bearer ${token}` },
        });
      }
      setTimeout(pollSpotify, 500);
    } catch (e) {
      console.error('Ring action failed:', e);
    }
  });
}

function setupSettingsInputs(): void {
  if (!spotifyClientIdInput || !auddApiTokenInput) return;
  spotifyClientIdInput.value = getStoredSpotifyClientId() || getSpotifyClientId();
  auddApiTokenInput.value    = getStoredAuddApiToken()    || getAuddApiToken();
  if (spotifyRedirectUriText) {
    spotifyRedirectUriText.textContent = `Spotify Redirect URI: ${getSpotifyRedirectUri()}`;
  }
}

function setupSettingsSave(): void {
  if (!btnSaveSettings || !spotifyClientIdInput || !auddApiTokenInput) return;
  btnSaveSettings.addEventListener('click', () => {
    const previousClientId = getSpotifyClientId();
    const nextClientId     = spotifyClientIdInput!.value.trim();
    const nextAuddToken    = auddApiTokenInput!.value.trim();

    setSpotifyClientId(nextClientId);
    setAuddApiToken(nextAuddToken);

    if (previousClientId && previousClientId !== nextClientId) {
      clearSpotifySession();
    }
    if (loginHint) loginHint.textContent = 'Keys saved. You can now connect Spotify.';
  });
}

// --- Init ---
async function init(): Promise<void> {
  setupSettingsInputs();
  setupSettingsSave();

  // Check for OAuth callback
  if (window.location.search.includes('code=')) {
    const success = await handleCallback();
    if (success) {
      showScreen('player');
      setupRingController();
      startPolling(); // Start immediately — don't block on glasses init
      initGlasses().then(() => { lastLineIndex = -2; }); // Init in parallel, refresh when ready
      return;
    }
  }

  // Check for existing session
  if (isLoggedIn()) {
    showScreen('player');
    setupRingController();
    startPolling(); // Start immediately — don't block on glasses init
    initGlasses().then(() => { lastLineIndex = -2; }); // Init in parallel, refresh when ready
    return;
  }

  // Show login
  showScreen('login');
  btnLogin.addEventListener('click', async () => {
    try {
      if (!getSpotifyClientId()) {
        if (loginHint) loginHint.textContent = 'Add your Spotify Client ID, click Save Keys, then connect.';
        return;
      }
      btnLogin.setAttribute('disabled', 'true');
      if (loginHint) loginHint.textContent = 'Opening Spotify login...';
      await loginWithSpotify();
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : 'Spotify login failed. Check redirect URI and try again.';
      console.error('Login failed:', err);
      if (loginHint) loginHint.textContent = message;
      btnLogin.removeAttribute('disabled');
    }
  });
}

init();
