import {
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

let bridge: EvenAppBridge | null = null;
let isConnected = false;
let isInitialized = false;

// Container IDs
const ID_TITLE   = 100;
const ID_PREV    = 101;
const ID_CURRENT = 102;
const ID_NEXT    = 103;

// Ring controller callback
let onRingAction: ((action: 'click' | 'next' | 'prev') => void) | null = null;

export function setRingActionHandler(handler: (action: 'click' | 'next' | 'prev') => void): void {
  onRingAction = handler;
}

export async function initGlasses(): Promise<boolean> {
  try {
    bridge = await waitForEvenAppBridge();
    isConnected = true;
    console.log('Even App Bridge ready');

    bridge.onDeviceStatusChanged((status) => {
      console.log('Device status changed:', status);
    });

    bridge.onEvenHubEvent((event: any) => {
      console.log('EvenHub event:', event);
      if (event.listEvent && onRingAction) {
        const idx = event.listEvent.currentSelectItemIndex ?? event.listEvent.index ?? 0;
        console.log('Ring/list event index:', idx);
        if (idx === 1) onRingAction('next');
        else if (idx === 2) onRingAction('prev');
        else onRingAction('click');
      }
    });

    // createStartUpPageContainer can only be called ONCE per session.
    // Image containers are limited to max 200×100 px — too small for lyrics.
    // Use list containers which support the full 576×288 canvas.
    const result = await bridge.createStartUpPageContainer({
      containerTotalNum: 4,
      listObject: [
        {
          containerID: ID_TITLE,
          containerName: 'title',
          xPosition: 10,
          yPosition: 5,
          width: 556,
          height: 75,
          itemContainer: {
            itemCount: 2,
            itemWidth: 0,
            isItemSelectBorderEn: 0,
            itemName: ['LyricLens', 'Ready'],
          },
          isEventCapture: 0,
        },
        {
          containerID: ID_PREV,
          containerName: 'prev',
          xPosition: 10,
          yPosition: 85,
          width: 556,
          height: 45,
          itemContainer: {
            itemCount: 1,
            itemWidth: 0,
            isItemSelectBorderEn: 0,
            itemName: [''],
          },
          isEventCapture: 0,
        },
        {
          containerID: ID_CURRENT,
          containerName: 'current',
          xPosition: 10,
          yPosition: 135,
          width: 556,
          height: 60,
          itemContainer: {
            itemCount: 1,
            itemWidth: 0,
            isItemSelectBorderEn: 1,
            itemName: ['Waiting for music...'],
          },
          isEventCapture: 1,
        },
        {
          containerID: ID_NEXT,
          containerName: 'next',
          xPosition: 10,
          yPosition: 200,
          width: 556,
          height: 45,
          itemContainer: {
            itemCount: 1,
            itemWidth: 0,
            isItemSelectBorderEn: 0,
            itemName: [''],
          },
          isEventCapture: 0,
        },
      ],
    });

    console.log('createStartUpPageContainer result:', result);

    if (result === 0) {
      isInitialized = true;
      updateGlassesStatusUI(true);
      return true;
    }

    console.error('Failed to create glasses containers, result:', result);
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
  _albumArtUrl?: string,
  progressPct?: number,
  elapsedMs?: number,
  totalMs?: number,
): Promise<void> {
  if (!bridge || !isConnected || !isInitialized) return;

  const MAX_CHARS = 60;

  // Title row: track name
  // Second row: artist + progress
  const titleItems: string[] = [];
  if (trackName) {
    titleItems.push(truncate(trackName, MAX_CHARS));
    const artist = artistName || '';
    const elapsed = typeof elapsedMs === 'number' ? formatTime(elapsedMs) : '';
    const total   = typeof totalMs   === 'number' ? formatTime(totalMs)   : '';
    const bar     = typeof progressPct === 'number' ? buildProgressBar(progressPct) : '';
    if (elapsed && total) {
      titleItems.push(truncate(`${artist}  ${elapsed}${bar}${total}`, MAX_CHARS));
    } else {
      titleItems.push(truncate(artist, MAX_CHARS));
    }
  } else {
    titleItems.push('LyricLens');
    titleItems.push('');
  }

  const prevItems    = prevLine    ? [truncate(prevLine,    MAX_CHARS)] : [''];
  const currentItems = currentLine ? [truncate(currentLine, MAX_CHARS)] : [''];
  const nextItems    = nextLine    ? [truncate(nextLine,    MAX_CHARS)] : [''];

  try {
    await bridge.rebuildPageContainer({
      containerTotalNum: 4,
      listObject: [
        {
          containerID: ID_TITLE,
          containerName: 'title',
          xPosition: 10,
          yPosition: 5,
          width: 556,
          height: 75,
          itemContainer: {
            itemCount: titleItems.length,
            itemWidth: 0,
            isItemSelectBorderEn: 0,
            itemName: titleItems,
          },
          isEventCapture: 0,
        },
        {
          containerID: ID_PREV,
          containerName: 'prev',
          xPosition: 10,
          yPosition: 85,
          width: 556,
          height: 45,
          itemContainer: {
            itemCount: prevItems.length,
            itemWidth: 0,
            isItemSelectBorderEn: 0,
            itemName: prevItems,
          },
          isEventCapture: 0,
        },
        {
          containerID: ID_CURRENT,
          containerName: 'current',
          xPosition: 10,
          yPosition: 135,
          width: 556,
          height: 60,
          itemContainer: {
            itemCount: currentItems.length,
            itemWidth: 0,
            isItemSelectBorderEn: 1,
            itemName: currentItems,
          },
          isEventCapture: 1,
        },
        {
          containerID: ID_NEXT,
          containerName: 'next',
          xPosition: 10,
          yPosition: 200,
          width: 556,
          height: 45,
          itemContainer: {
            itemCount: nextItems.length,
            itemWidth: 0,
            isItemSelectBorderEn: 0,
            itemName: nextItems,
          },
          isEventCapture: 0,
        },
      ],
    });
  } catch (err) {
    console.error('Failed to send lyrics to glasses:', err);
  }
}

export async function clearGlassesDisplay(): Promise<void> {
  if (!bridge || !isConnected) return;
  try {
    await bridge.shutDownPageContainer(0);
    isInitialized = false;
  } catch (err) {
    console.error('Failed to clear glasses display:', err);
  }
}

export function isGlassesConnected(): boolean {
  return isConnected;
}

// --- Helpers ---

function truncate(text: string, maxChars: number): string {
  if (!text) return '';
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
  const total = 10;
  const filled = Math.round((pct / 100) * total);
  const empty = total - filled;
  return '[' + '='.repeat(filled) + '-'.repeat(empty) + ']';
}

function updateGlassesStatusUI(connected: boolean): void {
  const indicator = document.getElementById('glasses-indicator');
  const text = document.getElementById('glasses-text');
  if (indicator) {
    indicator.className = `indicator ${connected ? 'connected' : 'disconnected'}`;
  }
  if (text) {
    text.textContent = connected ? 'Glasses: Connected' : 'Glasses: Not connected';
  }
}
