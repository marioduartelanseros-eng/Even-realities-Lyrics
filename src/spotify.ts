// ========================================
// PASTE YOUR SPOTIFY CLIENT ID HERE
// ========================================
const CLIENT_ID = '4c76a9f64daa452487942d8be15bbe2c';
const REDIRECT_URI = 'http://127.0.0.1:5173/callback';
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';

// --- Token storage ---
function getToken(): string | null {
  return localStorage.getItem('spotify_access_token');
}

function setToken(token: string, expiresIn: number): void {
  localStorage.setItem('spotify_access_token', token);
  localStorage.setItem('spotify_token_expiry', String(Date.now() + expiresIn * 1000));
  localStorage.setItem('spotify_refresh_token', token); // PKCE uses same flow to refresh
}

function getRefreshToken(): string | null {
  return localStorage.getItem('spotify_refresh_token');
}

export function isTokenValid(): boolean {
  const expiry = localStorage.getItem('spotify_token_expiry');
  return !!expiry && Date.now() < parseInt(expiry, 10);
}

export function isLoggedIn(): boolean {
  return !!getToken() && isTokenValid();
}

// --- PKCE helpers ---
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// --- Auth flow ---
export async function loginWithSpotify(): Promise<void> {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  localStorage.setItem('spotify_code_verifier', codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    redirect_uri: REDIRECT_URI,
  });

  window.location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
}

export async function handleCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return false;

  const codeVerifier = localStorage.getItem('spotify_code_verifier');
  if (!codeVerifier) return false;

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    const data = await response.json();
    if (data.access_token) {
      setToken(data.access_token, data.expires_in);
      if (data.refresh_token) {
        localStorage.setItem('spotify_refresh_token', data.refresh_token);
      }
      // Clean URL
      window.history.replaceState({}, document.title, '/');
      return true;
    }
  } catch (err) {
    console.error('Token exchange failed:', err);
  }
  return false;
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();
    if (data.access_token) {
      setToken(data.access_token, data.expires_in);
      if (data.refresh_token) {
        localStorage.setItem('spotify_refresh_token', data.refresh_token);
      }
      return true;
    }
  } catch (err) {
    console.error('Token refresh failed:', err);
  }
  return false;
}

// --- Now Playing ---
export interface NowPlaying {
  trackId: string;
  trackName: string;
  artistName: string;
  albumName: string;
  albumArt: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
  timestamp: number; // when we received this data
}

export async function getNowPlaying(): Promise<NowPlaying | null> {
  let token = getToken();
  if (!token || !isTokenValid()) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) return null;
    token = getToken();
  }

  try {
    const response = await fetch(
      'https://api.spotify.com/v1/me/player/currently-playing',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (response.status === 204) return null; // nothing playing
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.item || data.currently_playing_type !== 'track') return null;

    return {
      trackId: data.item.id,
      trackName: data.item.name,
      artistName: data.item.artists.map((a: any) => a.name).join(', '),
      albumName: data.item.album.name,
      albumArt: data.item.album.images?.[0]?.url || '',
      durationMs: data.item.duration_ms,
      progressMs: data.progress_ms || 0,
      isPlaying: data.is_playing,
      timestamp: Date.now(),
    };
  } catch (err) {
    console.error('Failed to get now playing:', err);
    return null;
  }
}

export function getAccessToken(): string | null {
  return getToken();
}
