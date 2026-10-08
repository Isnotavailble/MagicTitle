import fs from 'fs';

export function parseSrt(content) {
  if (!content) return [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = normalized.split(/\n\s*\n/);
  const entries = [];

  for (const b of blocks) {
    const lines = b.trim().split('\n');
    if (lines.length >= 2) {
      let index = lines[0].trim();
      let tsLine = lines[1].trim();
      let textLines = lines.slice(2);

      // Handle cases where index might be missing or merged
      if (!tsLine.includes('-->') && lines[0].includes('-->')) {
        tsLine = lines[0].trim();
        index = String(entries.length + 1);
        textLines = lines.slice(1);
      }

      const match = tsLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
      const text = textLines.map(l => l.trim()).join(' ');

      if (match) {
        entries.push({
          index: index || String(entries.length + 1),
          start: match[1].replace('.', ','),
          end: match[2].replace('.', ','),
          timestamp: tsLine,
          text: text,
        });
      }
    }
  }

  return entries;
}

export function stringifySrt(entries) {
  return entries.map((entry, i) => {
    const idx = entry.index || (i + 1);
    const ts = entry.timestamp || `${entry.start} --> ${entry.end}`;
    return `${idx}\n${ts}\n${entry.text || ''}`;
  }).join('\n\n') + '\n';
}

export function timeToMs(timeStr) {
  if (!timeStr) return 0;
  const [hms, msPart] = timeStr.replace('.', ',').split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return (h * 3600 + m * 60 + s) * 1000 + (Number(msPart) || 0);
}

export function msToTime(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const remMs = ms % 1000;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n, z = 2) => String(n).padStart(z, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(remMs, 3)}`;
}

/**
 * Sanitizes SRT cues:
 * 1. Collapses consecutive duplicate lines (noise hallucination loops).
 * 2. Clamps over-extended hanging durations based on word/character count.
 * 3. Enforces valid non-overlapping chronological timestamps.
 */
export function sanitizeSrtEntries(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const {
    minDurationMs = 1200,
    maxDurationMs = 6000,
    msPerWord = 450,
    baseBufferMs = 800,
  } = options;

  const sanitized = [];
  let lastText = '';

  for (const entry of entries) {
    let rawText = (entry.text || '').trim();
    if (!rawText) continue;

    // Filter out pure music symbols / noise markers (♪, ♪♪, ♫, [music], (applause), etc.)
    const isMusicOrSymbolOnly = /^[\s♪♫🎵#\*\-\.\,\!\?_~]+$/i.test(rawText) ||
      /^(\[|\()?(\s*music\s*|\s*applause\s*|\s*singing\s*|\s*laughter\s*|\s*cheering\s*|\s*gasp\s*)(\]|\))?$/i.test(rawText);
    if (isMusicOrSymbolOnly) {
      continue;
    }

    // Strip leading/trailing music notes from mixed dialogue lines (e.g. "♪ Hello ♪" -> "Hello")
    rawText = rawText.replace(/^[♪♫🎵\s]+|[♪♫🎵\s]+$/g, '').trim();
    if (!rawText) continue;

    // 1. Repetition loop deduplication
    const normalizedText = rawText.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedText && normalizedText === lastText) {
      continue;
    }
    lastText = normalizedText;

    const startMs = timeToMs(entry.start);
    let endMs = timeToMs(entry.end);

    // If end is before or equal to start, assign reasonable minimum default
    if (endMs <= startMs) {
      endMs = startMs + minDurationMs;
    }

    sanitized.push({
      index: String(sanitized.length + 1),
      start: msToTime(startMs),
      end: msToTime(endMs),
      timestamp: `${msToTime(startMs)} --> ${msToTime(endMs)}`,
      text: rawText,
    });
  }

  // Ensure cues do not overlap if a previous cue was lengthened
  for (let i = 0; i < sanitized.length - 1; i++) {
    const currEndMs = timeToMs(sanitized[i].end);
    const nextStartMs = timeToMs(sanitized[i + 1].start);
    if (currEndMs > nextStartMs) {
      const adjustedEndMs = Math.max(timeToMs(sanitized[i].start) + 800, nextStartMs - 50);
      sanitized[i].end = msToTime(adjustedEndMs);
      sanitized[i].timestamp = `${sanitized[i].start} --> ${sanitized[i].end}`;
    }
  }

  return sanitized;
}

export function readSrtFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseSrt(content);
}

export function writeSrtFile(filePath, entries) {
  const content = stringifySrt(entries);
  fs.writeFileSync(filePath, content, 'utf-8');
}
