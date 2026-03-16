import {
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { encodeGrayscalePng } from './png-encoder';

let bridge: EvenAppBridge | null = null;
let isConnected = false;
let displayMode: 'list' | 'image' | null = null;
let listenersRegistered = false;
let displayInitializationInFlight: Promise<boolean> | null = null;
let lastDisplayInitAttemptAt = 0;
let startupPageInitialized = false;

const CONTAINER_ID = 100;
const CONTAINER_NAME = 'lyrics';
const DISPLAY_INIT_RETRY_COOLDOWN_MS = 2000;
const DISPLAY_INIT_TIMEOUT_MS = 3000;

// Display dimensions
const DISPLAY_W = 576;
const DISPLAY_H = 200;

// Offscreen canvas
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

// Album art cache
let cachedArtUrl = '';
let cachedArtImg: HTMLImageElement | null = null;

// Ring controller callback
let onRingAction: ((action: 'click' | 'next' | 'prev') => void) | null = null;

export function setRingActionHandler(handler: (action: 'click' | 'next' | 'prev') => void): void {
  onRingAction = handler;
}

interface EvenHubListEventPayload {
  currentSelectItemIndex?: number;
  index?: number;
  itemIndex?: number;
}

interface EvenHubEventPayload {
  listEvent?: EvenHubListEventPayload;
}

const CONNECTED_STATUS_VALUES = new Set(['connected', 'ready', 'online']);
const DISCONNECTED_STATUS_VALUES = new Set([
  'disconnected',
  'offline',
  'not_connected',
  'connectionfailed',
  'connection_failed',
]);
const MAX_STATUS_PARSE_DEPTH = 4;

function parseConnectedToken(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (CONNECTED_STATUS_VALUES.has(normalized)) return true;
    if (DISCONNECTED_STATUS_VALUES.has(normalized)) return false;
  }
  return null;
}

function parseDeviceConnected(status: unknown, depth = 0): boolean | null {
  // Even Hub SDK status payloads vary by platform/version.
  // Accept common boolean fields and simple textual status values.
  const direct = parseConnectedToken(status);
  if (direct !== null) return direct;
  if (!status || typeof status !== 'object') return null;
  if (depth >= MAX_STATUS_PARSE_DEPTH) return null;

  const candidate = status as {
    connected?: unknown;
    isConnected?: unknown;
    deviceConnected?: unknown;
    connectType?: unknown;
    status?: unknown;
    data?: unknown;
    payload?: unknown;
  };

  const connectedValue = parseConnectedToken(candidate.connected);
  if (connectedValue !== null) return connectedValue;
  const isConnectedValue = parseConnectedToken(candidate.isConnected);
  if (isConnectedValue !== null) return isConnectedValue;
  const deviceConnectedValue = parseConnectedToken(candidate.deviceConnected);
  if (deviceConnectedValue !== null) return deviceConnectedValue;
  const connectTypeValue = parseConnectedToken(candidate.connectType);
  if (connectTypeValue !== null) return connectTypeValue;
  const statusValue = parseConnectedToken(candidate.status);
  if (statusValue !== null) return statusValue;
  if (candidate.data) {
    const dataResult = parseDeviceConnected(candidate.data, depth + 1);
    if (dataResult !== null) return dataResult;
  }
  if (candidate.payload) {
    const payloadResult = parseDeviceConnected(candidate.payload, depth + 1);
    if (payloadResult !== null) return payloadResult;
  }

  return null;
}

function ensureCanvas(): CanvasRenderingContext2D {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = DISPLAY_W;
    canvas.height = DISPLAY_H;
    ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  }
  return ctx!;
}

/**
 * Load album art and cache it
 */
async function loadAlbumArt(url: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  if (url === cachedArtUrl && cachedArtImg) return cachedArtImg;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cachedArtImg = img;
      cachedArtUrl = url;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Render the full display frame on canvas
 */
function renderFrame(
  trackName: string,
  artistName: string,
  albumArt: HTMLImageElement | null,
  prevLine: string,
  currentLine: string,
  nextLine: string,
  progressPct: number,
  elapsedMs: number,
  totalMs: number,
): void {
  const c = ensureCanvas();

  // Clear — black background
  c.fillStyle = '#000000';
  c.fillRect(0, 0, DISPLAY_W, DISPLAY_H);

  // --- Album Art (greyscale, left side) ---
  const artSize = 72;
  const artX = 8;
  const artY = 6;
  const hasArt = albumArt !== null;

  if (albumArt) {
    c.drawImage(albumArt, artX, artY, artSize, artSize);
    // Convert drawn art to greyscale in-place
    const artData = c.getImageData(artX, artY, artSize, artSize);
    const px = artData.data;
    for (let i = 0; i < px.length; i += 4) {
      const grey = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      px[i] = grey;
      px[i + 1] = grey;
      px[i + 2] = grey;
    }
    c.putImageData(artData, artX, artY);
  }

  const textX = hasArt ? artX + artSize + 12 : 12;
  const rightEdge = DISPLAY_W - 12;
  const maxTextW = rightEdge - textX;

  // --- Track Name (bright, bold) ---
  c.fillStyle = '#FFFFFF';
  c.font = 'bold 18px Arial, sans-serif';
  c.textBaseline = 'top';
  c.fillText(fitText(c, trackName, maxTextW), textX, 10);

  // --- Artist Name (medium brightness) ---
  c.fillStyle = '#AAAAAA';
  c.font = '14px Arial, sans-serif';
  c.fillText(fitText(c, artistName, maxTextW), textX, 32);

  // --- Progress Bar ---
  const barY = 56;
  const barH = 3;
  const barW = maxTextW;

  // Background bar (dim)
  c.fillStyle = '#333333';
  c.fillRect(textX, barY, barW, barH);
  // Filled bar (bright)
  c.fillStyle = '#CCCCCC';
  const filledW = Math.round((progressPct / 100) * barW);
  c.fillRect(textX, barY, filledW, barH);

  // --- Time stamps ---
  c.fillStyle = '#888888';
  c.font = '11px Arial, sans-serif';
  const elapsedStr = formatTime(elapsedMs);
  const totalStr = formatTime(totalMs);
  c.fillText(elapsedStr, textX, barY + 6);
  c.textAlign = 'right';
  c.fillText(totalStr, rightEdge, barY + 6);
  c.textAlign = 'left';

  // --- Separator Line ---
  const sepY = 82;
  c.strokeStyle = '#444444';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(8, sepY);
  c.lineTo(DISPLAY_W - 8, sepY);
  c.stroke();

  // --- Lyrics Area ---
  const lyricsX = 14;
  const lyricsMaxW = DISPLAY_W - 28;

  // Previous line (dim, allow up to 2 wrapped lines)
  c.textBaseline = 'top';
  let lyricsCursorY = 90;
  if (prevLine) {
    c.fillStyle = '#555555';
    c.font = '15px Arial, sans-serif';
    const prevLines = wrapText(c, prevLine, lyricsMaxW, 2);
    for (const line of prevLines) {
      c.fillText(line, lyricsX, lyricsCursorY);
      lyricsCursorY += 18;
    }
    lyricsCursorY += 4;
  }

  // Current line (BRIGHT, larger, allow up to 2 wrapped lines)
  c.fillStyle = '#FFFFFF';
  c.font = 'bold 22px Arial, sans-serif';
  const currentLines = wrapText(c, currentLine, lyricsMaxW, 2);
  for (const line of currentLines) {
    c.fillText(line, lyricsX, lyricsCursorY);
    lyricsCursorY += 25;
  }
  lyricsCursorY += 4;

  // Next line (dim, allow up to 1 wrapped line)
  if (nextLine) {
    c.fillStyle = '#555555';
    c.font = '15px Arial, sans-serif';
    const nextLines = wrapText(c, nextLine, lyricsMaxW, 1);
    for (const line of nextLines) {
      c.fillText(line, lyricsX, lyricsCursorY);
      lyricsCursorY += 18;
    }
  }
}

/**
 * Fit text to max width, truncating with ellipsis if needed
 */
function fitText(c: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (c.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && c.measureText(t + '...').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '...';
}

function wrapText(
  c: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return [''];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';
  let truncated = false;

  for (const word of words) {
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    if (c.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (!current) {
      // Break long single words by character width.
      let chunk = '';
      for (const ch of word) {
        const nextChunk = chunk + ch;
        if (c.measureText(nextChunk).width <= maxWidth) {
          chunk = nextChunk;
        } else {
          if (chunk) lines.push(chunk);
          chunk = ch;
          if (lines.length >= maxLines) {
            truncated = true;
            break;
          }
        }
      }
      current = chunk;
    } else {
      lines.push(current);
      current = word;
    }

    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  } else if (current && lines.length >= maxLines) {
    truncated = true;
  }

  if (lines.length > maxLines) {
    truncated = true;
  }

  const limited = lines.slice(0, Math.max(1, maxLines));
  if (truncated && limited.length > 0) {
    limited[limited.length - 1] = fitText(c, `${limited[limited.length - 1]}...`, maxWidth);
  }
  return limited;
}

/**
 * Convert canvas to grayscale PNG and send to glasses
 */
async function sendFrameToGlasses(): Promise<void> {
  if (!bridge || !canvas || !ctx) return;

  const imageData = ctx.getImageData(0, 0, DISPLAY_W, DISPLAY_H);
  const pixels = imageData.data;

  // Convert RGBA to grayscale byte array
  const grayscale = new Uint8Array(DISPLAY_W * DISPLAY_H);
  for (let i = 0; i < grayscale.length; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    grayscale[i] = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
  }

  // Encode as PNG
  const pngData = encodeGrayscalePng(DISPLAY_W, DISPLAY_H, grayscale);

  // Convert to base64
  let binary = '';
  for (let i = 0; i < pngData.length; i++) {
    binary += String.fromCharCode(pngData[i]);
  }
  const base64 = btoa(binary);

  try {
    const result = await bridge.callEvenApp('updateImageRawData', {
      containerID: CONTAINER_ID,
      containerName: CONTAINER_NAME,
      imageData: base64,
    });
    // Don't log every frame to avoid spam
  } catch (err) {
    console.error('Failed to send image to glasses:', err);
  }
}

async function initializeDisplayContainer(): Promise<boolean> {
  const activeBridge = bridge;
  if (!activeBridge) return false;
  if (displayInitializationInFlight) return displayInitializationInFlight;

  displayInitializationInFlight = (async () => {
    try {
      ensureCanvas();
      const containerCreateMethod = startupPageInitialized
        ? 'rebuildPageContainer'
        : 'createStartUpPageContainer';

      // Try image container
      const imgResult = await activeBridge.callEvenApp(containerCreateMethod, {
        containerTotalNum: 1,
        imageObject: [{
          containerID: CONTAINER_ID,
          containerName: CONTAINER_NAME,
          xPosition: 0,
          yPosition: 0,
          width: DISPLAY_W,
          height: DISPLAY_H,
        }],
      });
      console.log('IMAGE container result:', imgResult);

      if (imgResult === 0) {
        displayMode = 'image';
        startupPageInitialized = true;
        console.log('Using IMAGE mode with PNG encoder');

        // Send initial frame
        const c = ensureCanvas();
        c.fillStyle = '#000000';
        c.fillRect(0, 0, DISPLAY_W, DISPLAY_H);
        c.fillStyle = '#FFFFFF';
        c.font = 'bold 24px Arial, sans-serif';
        c.textBaseline = 'middle';
        c.textAlign = 'center';
        c.fillText('LyricLens', DISPLAY_W / 2, DISPLAY_H / 2 - 14);
        c.fillStyle = '#888888';
        c.font = '14px Arial, sans-serif';
        c.fillText('Waiting for music...', DISPLAY_W / 2, DISPLAY_H / 2 + 14);
        c.textAlign = 'left';
        await sendFrameToGlasses();

        updateGlassesStatusUI(true);
        return true;
      }

      // Fallback: list mode (4 containers)
      if (!startupPageInitialized) {
        await activeBridge.callEvenApp('shutDownPageContainer', { exitMode: 0 });
      }
      const listResult = await activeBridge.callEvenApp(containerCreateMethod, {
        containerTotalNum: 4,
        listObject: [
          {
            containerID: CONTAINER_ID,
            containerName: 'title',
            xPosition: 15,
            yPosition: 5,
            width: 610,
            height: 95,
            itemContainer: {
              itemCount: 2,
              itemWidth: 590,
              isItemSelectBorderEn: 1,
              itemName: ['LyricLens', ''],
            },
            isEventCapture: 0,
          },
          {
            containerID: CONTAINER_ID + 1,
            containerName: 'prev',
            xPosition: 15,
            yPosition: 105,
            width: 610,
            height: 40,
            itemContainer: {
              itemCount: 1,
              itemWidth: 590,
              isItemSelectBorderEn: 0,
              itemName: [''],
            },
            isEventCapture: 0,
          },
          {
            containerID: CONTAINER_ID + 2,
            containerName: 'current',
            xPosition: 15,
            yPosition: 150,
            width: 610,
            height: 40,
            itemContainer: {
              itemCount: 1,
              itemWidth: 590,
              isItemSelectBorderEn: 1,
              itemName: ['Waiting for music...'],
            },
            isEventCapture: 1,
          },
          {
            containerID: CONTAINER_ID + 3,
            containerName: 'next',
            xPosition: 15,
            yPosition: 195,
            width: 610,
            height: 40,
            itemContainer: {
              itemCount: 1,
              itemWidth: 590,
              isItemSelectBorderEn: 0,
              itemName: [''],
            },
            isEventCapture: 0,
          },
        ],
      });
      console.log('LIST 4-container result:', listResult);

      if (listResult === 0) {
        displayMode = 'list';
        startupPageInitialized = true;
        console.log('Using LIST mode (4 containers fallback)');
        updateGlassesStatusUI(true);
        return true;
      }

      console.error('All container types failed');
      displayMode = null;
      updateGlassesStatusUI(false);
      return false;
    } catch (err) {
      console.error('Failed to initialize Even Hub display container:', err);
      displayMode = null;
      updateGlassesStatusUI(false);
      return false;
    }
  })();

  try {
    return await displayInitializationInFlight;
  } finally {
    displayInitializationInFlight = null;
  }
}

/**
 * Initialize glasses with retry logic for QR code loading scenarios.
 * When the app loads via QR code in Even Hub, the SDK may need extra time to initialize.
 * In web browsers, waitForEvenAppBridge() fails quickly so retries are minimal.
 */
export async function initGlasses(maxRetries = 3, delayMs = 500): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Initializing glasses (attempt ${attempt}/${maxRetries})...`);
      
      // Add delay on retry attempts to allow SDK to initialize
      if (attempt > 1) {
        console.log(`Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      bridge = await waitForEvenAppBridge();
      isConnected = true;
      console.log('Bridge ready:', bridge.ready);

      if (!listenersRegistered) {
        bridge.onDeviceStatusChanged((status) => {
          console.log('Device status changed:', status);
          const connected = parseDeviceConnected(status);
          if (connected === false) {
            isConnected = false;
            displayMode = null;
            updateGlassesStatusUI(false);
            return;
          }
          if (connected === true) {
            isConnected = true;
            if (!displayMode) {
              initializeDisplayContainer()
                .then((initialized) => {
                  if (!initialized) {
                    console.error('Failed to reinitialize display container after reconnect; initialization will retry on the next lyric update');
                  }
                })
                .catch((err) => {
                  console.error('Display container reinitialization threw after reconnect:', err);
                });
            } else {
              updateGlassesStatusUI(true);
            }
          }
        });

        bridge.onEvenHubEvent((event: EvenHubEventPayload) => {
          console.log('EvenHub event:', event);
          if (event.listEvent && onRingAction) {
            const idx = event.listEvent.currentSelectItemIndex
              ?? event.listEvent.index
              ?? event.listEvent.itemIndex;
            console.log('Ring/list event index:', idx);
            if (typeof idx !== 'number') return;
            if (idx === 1) onRingAction('next');
            else if (idx === 2) onRingAction('prev');
            else if (idx === 0) onRingAction('click');
          }
        });

        listenersRegistered = true;
      }

      const initialized = await initializeDisplayContainer();
      if (!initialized) {
        console.warn('Even Hub bridge is connected, but display container is not ready yet. Will retry on lyric updates.');
      }
      return true;
    } catch (err) {
      console.warn(`Glasses initialization attempt ${attempt}/${maxRetries} failed:`, err);
      
      // If this was the last attempt, give up
      if (attempt === maxRetries) {
        console.error('Even Hub SDK not available after all retries:', err);
        isConnected = false;
        updateGlassesStatusUI(false);
        return false;
      }
      
      // Otherwise, continue to next retry
      console.log('Will retry glasses initialization...');
    }
  }
  
  // Fallback: If all retries exhausted without explicit return (shouldn't happen)
  isConnected = false;
  updateGlassesStatusUI(false);
  return false;
}

export async function displayLyricOnGlasses(
  currentLine: string,
  nextLine?: string,
  prevLine?: string,
  trackName?: string,
  artistName?: string,
  albumArtUrl?: string,
  progressPct?: number,
  elapsedMs?: number,
  totalMs?: number,
): Promise<void> {
  if (!bridge || !isConnected) return;
  if (!displayMode) {
    const now = Date.now();
    if (now - lastDisplayInitAttemptAt < DISPLAY_INIT_RETRY_COOLDOWN_MS) {
      return;
    }
    lastDisplayInitAttemptAt = now;
    let initTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const initialized = await Promise.race<boolean>([
      initializeDisplayContainer(),
      new Promise<boolean>((resolve) => {
        initTimeoutId = setTimeout(() => resolve(false), DISPLAY_INIT_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (initTimeoutId) clearTimeout(initTimeoutId);
    });
    if (!initialized) {
      console.warn('Skipping glasses lyric update because display container is not initialized');
      return;
    }
  }

  if (displayMode === 'image') {
    // Load album art (cached after first load)
    const art = albumArtUrl ? await loadAlbumArt(albumArtUrl) : null;
    renderFrame(
      trackName || '',
      artistName || '',
      art,
      prevLine || '',
      currentLine,
      nextLine || '',
      progressPct || 0,
      elapsedMs || 0,
      totalMs || 0,
    );
    await sendFrameToGlasses();
    return;
  }

  // Fallback: list mode
  if (displayMode === 'list') {
    try {
      const MAX_LINE = 48;

      const titleItems: string[] = [];
      if (trackName) {
        titleItems.push(truncate(trackName, MAX_LINE));
        const artist = artistName || '';
        const elapsed = typeof elapsedMs === 'number' ? formatTime(elapsedMs) : '';
        const total = typeof totalMs === 'number' ? formatTime(totalMs) : '';
        const progress = typeof progressPct === 'number'
          ? buildProgressBar(progressPct)
          : '';
        if (elapsed && total) {
          titleItems.push(truncate(`${artist}    ${elapsed} ${progress} ${total}`, MAX_LINE));
        } else {
          titleItems.push(truncate(artist, MAX_LINE));
        }
      }

      const prevItems = prevLine ? wrapLine(prevLine, MAX_LINE, '') : [''];
      const currentItems = wrapLine(currentLine, MAX_LINE, '');
      const nextItems = nextLine ? wrapLine(nextLine, MAX_LINE, '') : [''];

      await bridge.callEvenApp('rebuildPageContainer', {
        containerTotalNum: 4,
        listObject: [
          {
            containerID: CONTAINER_ID,
            containerName: 'title',
            xPosition: 15,
            yPosition: 5,
            width: 610,
            height: 95,
            itemContainer: {
              itemCount: titleItems.length,
              itemWidth: 590,
              isItemSelectBorderEn: 1,
              itemName: titleItems,
            },
            isEventCapture: 0,
          },
          {
            containerID: CONTAINER_ID + 1,
            containerName: 'prev',
            xPosition: 15,
            yPosition: 105,
            width: 610,
            height: 70,
            itemContainer: {
              itemCount: prevItems.length,
              itemWidth: 590,
              isItemSelectBorderEn: 0,
              itemName: prevItems,
            },
            isEventCapture: 0,
          },
          {
            containerID: CONTAINER_ID + 2,
            containerName: 'current',
            xPosition: 15,
            yPosition: 150,
            width: 610,
            height: 70,
            itemContainer: {
              itemCount: currentItems.length,
              itemWidth: 590,
              isItemSelectBorderEn: 1,
              itemName: currentItems,
            },
            isEventCapture: 1,
          },
          {
            containerID: CONTAINER_ID + 3,
            containerName: 'next',
            xPosition: 15,
            yPosition: 195,
            width: 610,
            height: 70,
            itemContainer: {
              itemCount: nextItems.length,
              itemWidth: 590,
              isItemSelectBorderEn: 0,
              itemName: nextItems,
            },
            isEventCapture: 0,
          },
        ],
      });
    } catch (err) {
      console.error('Failed to send lyrics (list mode):', err);
    }
  }
}

export async function clearGlassesDisplay(): Promise<void> {
  if (!bridge || !isConnected) return;
  try {
    await bridge.shutDownPageContainer(0);
    displayMode = null;
  } catch (err) {
    console.error('Failed to clear glasses display:', err);
  }
}

export function isGlassesConnected(): boolean {
  return isConnected;
}

// --- Helpers ---

function wrapLine(text: string, maxChars: number, prefix: string): string[] {
  const available = maxChars - prefix.length;
  if (text.length <= available) return [`${prefix}${text}`];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if ((current + ' ' + word).length <= available) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines.map((line, i) => {
    if (i === 0) return `${prefix}${line}`;
    return `${' '.repeat(prefix.length)}${line}`;
  });
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + '...';
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function buildProgressBar(pct: number): string {
  const total = 12;
  const filled = Math.round((pct / 100) * total);
  const empty = total - filled;
  return '<' + '='.repeat(filled) + '-'.repeat(empty) + '>';
}

function updateGlassesStatusUI(connected: boolean): void {
  const indicator = document.getElementById('glasses-indicator');
  const text = document.getElementById('glasses-text');
  if (indicator) {
    indicator.className = `indicator ${connected ? 'connected' : 'disconnected'}`;
  }
  if (text) {
    text.textContent = connected
      ? `Glasses: Connected (${displayMode || 'none'})`
      : 'Glasses: Not connected';
  }
}
