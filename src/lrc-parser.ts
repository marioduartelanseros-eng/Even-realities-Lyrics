export interface LrcLine {
  time: number; // milliseconds
  text: string;
}

/**
 * Parse an LRC formatted string into timed lyric lines.
 */
export function parseLRC(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  const tagRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

  for (const rawLine of lrc.split('\n')) {
    const times: number[] = [];
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = tagRegex.exec(rawLine)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fraction = match[3].length === 2
        ? parseInt(match[3], 10) * 10
        : parseInt(match[3], 10);
      times.push(minutes * 60000 + seconds * 1000 + fraction);
      lastIndex = tagRegex.lastIndex;
    }
    tagRegex.lastIndex = 0;

    const text = rawLine.slice(lastIndex).trim();
    if (times.length > 0 && text) {
      for (const time of times) {
        lines.push({ time, text });
      }
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

/**
 * Find the index of the current lyric line given playback position.
 */
export function getCurrentLineIndex(lines: LrcLine[], positionMs: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= positionMs) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}
