const SPOTIFY_CLIENT_ID_KEY = 'settings_spotify_client_id';
const AUDD_API_TOKEN_KEY = 'settings_audd_api_token';

const ENV = (import.meta as ImportMeta & {
  env: Record<string, string | undefined>;
}).env;

export function getSpotifyRedirectUri(): string {
  // Return the current page URL (no query/hash) so it works on both
  // localhost and GitHub Pages subdirectory deployments like /Even-realities-Lyrics/
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
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
