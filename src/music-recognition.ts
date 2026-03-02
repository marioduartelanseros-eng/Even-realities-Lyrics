import { searchTrackOnSpotify, type SpotifyTrackLookup } from './spotify';
import { getAuddApiToken } from './runtime-config';

const AUDD_API_URL = 'https://api.audd.io/';
const AUDD_SAMPLE_MS = 6000;

export interface RecognizedTrack {
  trackId: string;
  trackName: string;
  artistName: string;
  albumName: string;
  albumArt: string;
  durationMs: number;
  progressMs: number;
}

function parseTimecodeMs(value: string | undefined): number {
  if (!value) return 0;
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000;
  }
  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  return 0;
}

async function captureAudioSample(durationMs: number): Promise<Blob | null> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return null;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  try {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(recorder.error || new Error('Audio recording failed'));
      recorder.onstop = () => {
        const type = mimeType || 'audio/webm';
        resolve(new Blob(chunks, { type }));
      };
      recorder.start();
      setTimeout(() => recorder.stop(), durationMs);
    });

    return blob;
  } finally {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}

interface AuddResponse {
  status: 'success' | 'error';
  result: {
    title?: string;
    artist?: string;
    album?: string;
    timecode?: string;
    spotify?: {
      id?: string;
      duration_ms?: number;
      album?: {
        name?: string;
        images?: Array<{ url?: string }>;
      };
      artists?: Array<{ name?: string }>;
      external_urls?: {
        spotify?: string;
      };
      name?: string;
    };
  } | null;
}

export function isAmbientRecognitionConfigured(): boolean {
  return Boolean(getAuddApiToken());
}

export async function recognizeAmbientTrack(): Promise<RecognizedTrack | null> {
  const auddApiToken = getAuddApiToken();
  if (!auddApiToken) return null;

  let sample: Blob;
  try {
    const captured = await captureAudioSample(AUDD_SAMPLE_MS);
    if (!captured) return null;
    sample = captured;
  } catch (err) {
    const asError = err instanceof Error ? err : null;
    if (asError?.name === 'NotAllowedError') {
      throw err;
    }
    console.warn('Ambient capture failed:', err);
    return null;
  }

  const formData = new FormData();
  formData.append('api_token', auddApiToken);
  formData.append('return', 'spotify');
  formData.append('file', sample, 'sample.webm');

  try {
    const response = await fetch(AUDD_API_URL, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as AuddResponse;
    if (data.status !== 'success' || !data.result) return null;

    const fromAudd = data.result;
    const title = fromAudd.spotify?.name || fromAudd.title || '';
    const artist = fromAudd.spotify?.artists?.map(a => a.name).filter(Boolean).join(', ')
      || fromAudd.artist
      || '';
    if (!title || !artist) return null;

    const spotifyMatch: SpotifyTrackLookup | null = await searchTrackOnSpotify(title, artist);
    const progressMs = parseTimecodeMs(fromAudd.timecode);

    if (spotifyMatch) {
      return {
        trackId: spotifyMatch.trackId,
        trackName: spotifyMatch.trackName,
        artistName: spotifyMatch.artistName,
        albumName: spotifyMatch.albumName,
        albumArt: spotifyMatch.albumArt,
        durationMs: spotifyMatch.durationMs || fromAudd.spotify?.duration_ms || 180000,
        progressMs,
      };
    }

    return {
      trackId: fromAudd.spotify?.id || `ambient:${title}:${artist}`.toLowerCase(),
      trackName: title,
      artistName: artist,
      albumName: fromAudd.spotify?.album?.name || fromAudd.album || '',
      albumArt: fromAudd.spotify?.album?.images?.[0]?.url || '',
      durationMs: fromAudd.spotify?.duration_ms || 180000,
      progressMs,
    };
  } catch (err) {
    console.error('Ambient recognition failed:', err);
    return null;
  }
}
