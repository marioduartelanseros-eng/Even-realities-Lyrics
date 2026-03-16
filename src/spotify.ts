import { getSpotifyClientId, getSpotifyClientSecret, getSpotifyRedirectUri } from './runtime-config';
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';

// --- Token storage ---
function getToken(): string | null {
  return localStorage.getItem('spotify_access_token');
}

function setToken(token: string, expiresIn: number): void {
  localStorage.setItem('spotify_access_token', token);
  localStorage.setItem('spotify_token_expiry', String(Date.now() + expiresIn * 1000));
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
  if (!crypto?.subtle) {
    throw new Error(
      'This browser/webview does not support Web Crypto (PKCE). Open the app in a modern browser like Chrome.',
    );
  }
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
  if (!window.isSecureContext) {
    throw new Error('Spotify login requires a secure context (localhost/127.0.0.1 or HTTPS).');
  }

  const clientId = getSpotifyClientId();
  if (!clientId) {
    throw new Error('Set your Spotify Client ID first in the login settings.');
  }
  const redirectUri = getSpotifyRedirectUri();
  
  console.log('Starting Spotify OAuth flow with redirect URI:', redirectUri);

  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  localStorage.setItem('spotify_code_verifier', codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    redirect_uri: redirectUri,
  });

  window.location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
}

export async function handleCallback(): Promise<boolean> {
  const clientId = getSpotifyClientId();
  if (!clientId) return false;
  const clientSecret = getSpotifyClientSecret();
  const redirectUri = getSpotifyRedirectUri();
  
  console.log('Processing OAuth callback with redirect URI:', redirectUri);

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
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      }),
    });

    const data = await response.json();
    if (data.access_token) {
      setToken(data.access_token, data.expires_in);
      if (data.refresh_token) {
        localStorage.setItem('spotify_refresh_token', data.refresh_token);
      }
      // Clean URL - remove query parameters but keep the current path
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      return true;
    } else {
      // Log the error response from Spotify for debugging
      console.error('Spotify token exchange failed:', {
        error: data.error,
        error_description: data.error_description,
        redirectUri,
      });
    }
  } catch (err) {
    console.error('Token exchange request failed:', err);
  }
  return false;
}

async function refreshAccessToken(): Promise<boolean> {
  const clientId = getSpotifyClientId();
  if (!clientId) return false;
  const clientSecret = getSpotifyClientSecret();
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
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

async function getValidToken(): Promise<string | null> {
  let token = getToken();
  if (!token || !isTokenValid()) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) return null;
    token = getToken();
  }
  return token;
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
  const token = await getValidToken();
  if (!token) return null;

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

export async function getAuthorizedAccessToken(): Promise<string | null> {
  return getValidToken();
}

export function clearSpotifySession(): void {
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_token_expiry');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_code_verifier');
}

export interface SpotifyTrackLookup {
  trackId: string;
  trackName: string;
  artistName: string;
  albumName: string;
  albumArt: string;
  durationMs: number;
}

export async function searchTrackOnSpotify(
  trackName: string,
  artistName: string,
): Promise<SpotifyTrackLookup | null> {
  const token = await getValidToken();
  if (!token) return null;

  const query = `track:${trackName} artist:${artistName}`;
  const params = new URLSearchParams({
    q: query,
    type: 'track',
    limit: '1',
  });

  try {
    const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;

    const data = await response.json();
    const item = data?.tracks?.items?.[0];
    if (!item) return null;

    return {
      trackId: item.id,
      trackName: item.name,
      artistName: item.artists.map((a: { name: string }) => a.name).join(', '),
      albumName: item.album?.name || '',
      albumArt: item.album?.images?.[0]?.url || '',
      durationMs: item.duration_ms || 0,
    };
  } catch (err) {
    console.error('Spotify track search failed:', err);
    return null;
  }
}
