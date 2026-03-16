const SPOTIFY_CLIENT_ID_KEY = 'settings_spotify_client_id';
const SPOTIFY_CLIENT_SECRET_KEY = 'settings_spotify_client_secret';
const AUDD_API_TOKEN_KEY = 'settings_audd_api_token';

const ENV = (import.meta as ImportMeta & {
  env: Record<string, string | undefined>;
}).env;

export function getSpotifyRedirectUri(): string {
  return `${window.location.origin}/Even-realities-Lyrics`;
}

export function getStoredSpotifyClientId(): string {
  return localStorage.getItem(SPOTIFY_CLIENT_ID_KEY)?.trim() || '';
}

export function getSpotifyClientId(): string {
  return getStoredSpotifyClientId() || (ENV.VITE_SPOTIFY_CLIENT_ID?.trim() || '');
}

export function setSpotifyClientId(clientId: string): void {
  const normalized = clientId.trim();
  if (normalized) {
    localStorage.setItem(SPOTIFY_CLIENT_ID_KEY, normalized);
  } else {
    localStorage.removeItem(SPOTIFY_CLIENT_ID_KEY);
  }
}

export function getStoredSpotifyClientSecret(): string {
  return localStorage.getItem(SPOTIFY_CLIENT_SECRET_KEY)?.trim() || '';
}

export function getSpotifyClientSecret(): string {
  return getStoredSpotifyClientSecret() || (ENV.VITE_SPOTIFY_CLIENT_SECRET?.trim() || '');
}

export function setSpotifyClientSecret(clientSecret: string): void {
  const normalized = clientSecret.trim();
  if (normalized) {
    localStorage.setItem(SPOTIFY_CLIENT_SECRET_KEY, normalized);
  } else {
    localStorage.removeItem(SPOTIFY_CLIENT_SECRET_KEY);
  }
}

export function getStoredAuddApiToken(): string {
  return localStorage.getItem(AUDD_API_TOKEN_KEY)?.trim() || '';
}

export function getAuddApiToken(): string {
  return getStoredAuddApiToken() || (ENV.VITE_AUDD_API_TOKEN?.trim() || '');
}

export function setAuddApiToken(token: string): void {
  const normalized = token.trim();
  if (normalized) {
    localStorage.setItem(AUDD_API_TOKEN_KEY, normalized);
  } else {
    localStorage.removeItem(AUDD_API_TOKEN_KEY);
  }
}

export function clearRuntimeConfig(): void {
  localStorage.removeItem(SPOTIFY_CLIENT_ID_KEY);
  localStorage.removeItem(SPOTIFY_CLIENT_SECRET_KEY);
  localStorage.removeItem(AUDD_API_TOKEN_KEY);
}
