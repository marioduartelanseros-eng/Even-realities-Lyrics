import {
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { encodeGrayscalePng } from './png-encoder';

// Album art image dimensions (must stay within SDK limits: w≤200, h≤100)
const ART_W = 88;
const ART_H = 88;

// Container IDs
const ID_ART     = 100; // image container — album art
const ID_TITLE   = 101; // list — track name + artist/progress
const ID_CURRENT = 102; // list — current lyric line  (isEventCapture=1)
const ID_NEXT    = 103; // list — next lyric line

let bridge: EvenAppBridge | null = null;
let isConnected  = false;
let isInitialized = false;
let isSending    = false; // guard against concurrent sends

// Album art cache: only re-encode PNG when the URL changes
let cachedArtUrl = '';
let cachedArtPng: Uint8Array | null = null;

// Ring controller callback
let onRingAction: ((action: 'click' | 'next' | 'prev') => void) | null = null;

export function setRingActionHandler(handler: (action: 'click' | 'next' | 'prev') => void): void {
  onRingAction = handler;
}

// --- Album art helpers ---

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function getAlbumArtPng(url: string): Promise<Uint8Array | null> {
  if (!url) return null;
  // Return cached bytes if the song hasn't changed
  if (url === cachedArtUrl && cachedArtPng) return cachedArtPng;

  try {
    const img = await loadImage(url);
    if (!img) return null;

    const canvas = document.createElement('canvas');
    canvas.width  = ART_W;
    canvas.height = ART_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // Draw and convert to greyscale
    ctx.drawImage(img, 0, 0, ART_W, ART_H);
    const { data } = ctx.getImageData(0, 0, ART_W, ART_H);
    const grey = new Uint8Array(ART_W * ART_H);
    for (let i = 0; i < grey.length; i++) {
      grey[i] = Math.round(data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114);
    }

    const png = encodeGrayscalePng(ART_W, ART_H, grey);
    cachedArtUrl = url;
    cachedArtPng = png;
    return png;
  } catch (err) {
    console.error('[glasses] Album art encode failed:', err);
    return null;
  }
}

// --- Init ---

export async function initGlasses(): Promise<boolean> {
  try {
    bridge = await waitForEvenAppBridge();
    isConnected = true;
    console.log('[glasses] Bridge ready');

    bridge.onDeviceStatusChanged((status) => {
      console.log('[glasses] Device status:', status);
    });

    bridge.onEvenHubEvent((event: any) => {
      console.log('[glasses] EvenHub event:', event);
      if (event.listEvent && onRingAction) {
        const idx = event.listEvent.currentSelectItemIndex ?? event.listEvent.index ?? 0;
        if      (idx === 1) onRingAction('next');
        else if (idx === 2) onRingAction('prev');
        else                onRingAction('click');
      }
    });

    // createStartUpPageContainer must be called exactly ONCE.
    // Layout: 88×88 album art (top-left) + title list (right of art) + current + next
    const result = await bridge.createStartUpPageContainer({
      containerTotalNum: 4,
      imageObject: [
        {
          containerID:   ID_ART,
          containerName: 'art',
          xPosition:     8,
          yPosition:     5,
          width:         ART_W,
          height:        ART_H,
        },
      ],
      listObject: [
        {
          containerID:   ID_TITLE,
          containerName: 'title',
          xPosition:     104,
          yPosition:     5,
          width:         464,
          height:        90,
          itemContainer: {
            itemCount:           2,
            itemWidth:           0,
            isItemSelectBorderEn: 0,
            itemName:            ['LyricLens', 'Ready'],
          },
          isEventCapture: 0,
        },
        {
          containerID:   ID_CURRENT,
          containerName: 'current',
          xPosition:     8,
          yPosition:     102,
          width:         560,
          height:        90,
          itemContainer: {
            itemCount:           1,
            itemWidth:           0,
            isItemSelectBorderEn: 1,
            itemName:            ['Waiting for music...'],
          },
          isEventCapture: 1,
        },
        {
          containerID:   ID_NEXT,
          containerName: 'next',
          xPosition:     8,
          yPosition:     197,
          width:         560,
          height:        50,
          itemContainer: {
            itemCount:           1,
            itemWidth:           0,
            isItemSelectBorderEn: 0,
            itemName:            [''],
          },
          isEventCapture: 0,
        },
      ],
    });

    console.log('[glasses] createStartUpPageContainer result:', result);

    if (result === 0) {
      isInitialized = true;
      updateGlassesStatusUI(true);
      return true;
    }

    console.error('[glasses] Container creation failed, result:', result);
    updateGlassesStatusUI(false);
    return false;
  } catch (err) {
    console.warn('[glasses] SDK not available:', err);
    isConnected = false;
    updateGlassesStatusUI(false);
    return false;
  }
}

// --- Display ---

export async function displayLyricOnGlasses(
  currentLine:  string,
  nextLine?:    string,
  _prevLine?:   string, // no longer shown on glasses (used art slot instead)
  trackName?:   string,
  artistName?:  string,
  albumArtUrl?: string,
  progressPct?: number,
  elapsedMs?:   number,
  totalMs?:     number,
): Promise<void> {
  if (!bridge || !isConnected || !isInitialized) return;
  if (isSending) return; // drop frame if previous send is still in flight
  isSending = true;

  const MAX = 52;

  // Title row: track name
  // Second row: artist + progress bar
  const titleItems: string[] = [];
  if (trackName) {
    titleItems.push(truncate(trackName, MAX));
    const artist  = artistName || '';
    const elapsed = typeof elapsedMs    === 'number' ? formatTime(elapsedMs) : '';
    const total   = typeof totalMs      === 'number' ? formatTime(totalMs)   : '';
    const bar     = typeof progressPct  === 'number' ? buildProgressBar(progressPct) : '';
    titleItems.push(elapsed && total
      ? truncate(`${artist}  ${elapsed}${bar}${total}`, MAX)
      : truncate(artist, MAX));
  } else {
    titleItems.push('LyricLens');
    titleItems.push('');
  }

  const currentItems = currentLine ? [truncate(currentLine, MAX)] : [''];
  const nextItems    = nextLine    ? [truncate(nextLine,    MAX)] : [''];

  try {
    // Rebuild all containers (SDK requires image to be included every time)
    await bridge.rebuildPageContainer({
      containerTotalNum: 4,
      imageObject: [
        {
          containerID:   ID_ART,
          containerName: 'art',
          xPosition:     8,
          yPosition:     5,
          width:         ART_W,
          height:        ART_H,
        },
      ],
      listObject: [
        {
          containerID:   ID_TITLE,
          containerName: 'title',
          xPosition:     104,
          yPosition:     5,
          width:         464,
          height:        90,
          itemContainer: {
            itemCount:           titleItems.length,
            itemWidth:           0,
            isItemSelectBorderEn: 0,
            itemName:            titleItems,
          },
          isEventCapture: 0,
        },
        {
          containerID:   ID_CURRENT,
          containerName: 'current',
          xPosition:     8,
          yPosition:     102,
          width:         560,
          height:        90,
          itemContainer: {
            itemCount:           currentItems.length,
            itemWidth:           0,
            isItemSelectBorderEn: 1,
            itemName:            currentItems,
          },
          isEventCapture: 1,
        },
        {
          containerID:   ID_NEXT,
          containerName: 'next',
          xPosition:     8,
          yPosition:     197,
          width:         560,
          height:        50,
          itemContainer: {
            itemCount:           nextItems.length,
            itemWidth:           0,
            isItemSelectBorderEn: 0,
            itemName:            nextItems,
          },
          isEventCapture: 0,
        },
      ],
    });

    // Re-send album art after every rebuild (SDK clears image placeholder on rebuild)
    if (albumArtUrl) {
      const png = await getAlbumArtPng(albumArtUrl);
      if (png) {
        await bridge.updateImageRawData({
          containerID:   ID_ART,
          containerName: 'art',
          imageData:     png,
        });
      }
    }
  } catch (err) {
    console.error('[glasses] Display update failed:', err);
  } finally {
    isSending = false;
  }
}

export async function clearGlassesDisplay(): Promise<void> {
  if (!bridge || !isConnected) return;
  try {
    await bridge.shutDownPageContainer(0);
    isInitialized = false;
  } catch (err) {
    console.error('[glasses] Clear failed:', err);
  }
}

export function isGlassesConnected(): boolean {
  return isConnected;
}

// --- Helpers ---

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length <= max ? text : text.slice(0, max - 3) + '...';
}

function formatTime(ms: number): string {
  const s   = Math.floor(ms / 1000);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function buildProgressBar(pct: number): string {
  const filled = Math.round((pct / 100) * 10);
  return '[' + '='.repeat(filled) + '-'.repeat(10 - filled) + ']';
}

function updateGlassesStatusUI(connected: boolean): void {
  const indicator = document.getElementById('glasses-indicator');
  const text      = document.getElementById('glasses-text');
  if (indicator) indicator.className = `indicator ${connected ? 'connected' : 'disconnected'}`;
  if (text)      text.textContent    = connected ? 'Glasses: Connected' : 'Glasses: Not connected';
}
