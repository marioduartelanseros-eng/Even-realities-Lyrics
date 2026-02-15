import {
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { encodeGrayscalePng } from './png-encoder';

let bridge: EvenAppBridge | null = null;
let isConnected = false;
let displayMode: 'list' | 'image' | null = null;

const CONTAINER_ID = 100;
const CONTAINER_NAME = 'lyrics';

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

  // Previous line (dim)
  if (prevLine) {
    c.fillStyle = '#555555';
    c.font = '16px Arial, sans-serif';
    c.fillText(fitText(c, prevLine, lyricsMaxW), lyricsX, 94);
  }

  // Current line (BRIGHT, larger, bold)
  c.fillStyle = '#FFFFFF';
  c.font = 'bold 24px Arial, sans-serif';
  c.fillText(fitText(c, currentLine, lyricsMaxW), lyricsX, 118);

  // Next line (dim)
  if (nextLine) {
    c.fillStyle = '#555555';
    c.font = '16px Arial, sans-serif';
    c.fillText(fitText(c, nextLine, lyricsMaxW), lyricsX, 152);
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

export async function initGlasses(): Promise<boolean> {
  try {
    bridge = await waitForEvenAppBridge();
    isConnected = true;
    console.log('Bridge ready:', bridge.ready);

    bridge.onDeviceStatusChanged((status) => {
      console.log('Device status changed:', status);
    });

    bridge.onEvenHubEvent((event: any) => {
      console.log('EvenHub event:', event);
      if (event.listEvent && onRingAction) {
        const idx = event.listEvent.index ?? event.listEvent.itemIndex ?? 0;
        console.log('Ring/list event index:', idx);
        if (idx === 1) onRingAction('next');
        else if (idx === 2) onRingAction('prev');
        else onRingAction('click');
      }
    });

    ensureCanvas();

    // Try image container
    const imgResult = await bridge.callEvenApp('createStartUpPageContainer', {
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
    await bridge.callEvenApp('shutDownPageContainer', { exitMode: 0 });
    const listResult = await bridge.callEvenApp('createStartUpPageContainer', {
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
      console.log('Using LIST mode (4 containers fallback)');
      updateGlassesStatusUI(true);
      return true;
    }

    console.error('All container types failed');
    updateGlassesStatusUI(false);
    return false;
  } catch (err) {
    console.warn('Even Hub SDK not available:', err);
    isConnected = false;
    updateGlassesStatusUI(false);
    return false;
  }
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
  if (!bridge || !isConnected || !displayMode) return;

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
