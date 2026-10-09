import fs from 'fs';
import nlp from 'compromise';
import { msToTime, timeToMs, stringifySrt } from './srt.js';

/**
 * Checks if a trimmed text ends with sentence terminal punctuation (. ! ?),
 * using compromise NLP to guard against abbreviations and acronyms.
 * 
 * @param {string} text - Cleaned subtitle text
 * @returns {boolean}
 */
export function isSentenceTerminal(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Trailing punctuation check (allows closing quotes/brackets like .", !', ?))
  const terminalMatch = trimmed.match(/([.!?])['"”’\)\]]*$/);
  if (!terminalMatch) return false;

  const punct = terminalMatch[1];
  // Question and exclamation marks are always sentence terminals
  if (punct === '?' || punct === '!') return true;

  // If it ends with ellipsis (...), treat as terminal pause/break
  if (trimmed.endsWith('...') || trimmed.endsWith('…')) return true;

  // For periods (.): verify if the ending term is an abbreviation/acronym via compromise
  try {
    const doc = nlp(trimmed);
    const lastTerm = doc.terms().last();
    if (lastTerm && lastTerm.found) {
      if (lastTerm.has('(#Abbreviation|#Acronym)')) {
        return false; // e.g. Dr., Mr., vs., etc., U.S.
      }
    }
  } catch {
    // Fallback: simple regex check if NLP throws
    if (/\b(mr|mrs|ms|dr|prof|vs|etc|eg|ie|approx|est|us|uk|dc)\.$/i.test(trimmed)) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if text starts with a dialogue speaker dash (e.g. "- Why?" or "-- ").
 * @param {string} text
 * @returns {boolean}
 */
export function isSpeakerTurn(text) {
  if (!text) return false;
  const trimmed = text.trim();
  return trimmed.startsWith('- ') || trimmed.startsWith('— ') || /^\-[A-Za-z]/.test(trimmed);
}

/**
 * Splits text into 2 balanced lines using \n if it exceeds maxCharsPerLine.
 * 
 * @param {string} text
 * @param {number} [maxCharsPerLine=42]
 * @returns {string}
 */
export function balanceSubtitleLines(text, maxCharsPerLine = 42) {
  if (!text) return '';
  const clean = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxCharsPerLine) return clean;

  const words = clean.split(' ');
  if (words.length <= 1) return clean;

  const targetMid = Math.floor(clean.length / 2);
  let bestIdx = 1;
  let minDiff = Infinity;
  let runningLen = 0;

  for (let i = 0; i < words.length - 1; i++) {
    runningLen += words[i].length + (i > 0 ? 1 : 0);
    const diff = Math.abs(runningLen - targetMid);

    // Prefer breaks after commas, semicolons, or clause marks
    const penalty = /[,;:!?]$/.test(words[i]) ? -4 : 0;
    const adjustedDiff = diff + penalty;

    if (adjustedDiff < minDiff) {
      minDiff = adjustedDiff;
      bestIdx = i + 1;
    }
  }

  const line1 = words.slice(0, bestIdx).join(' ');
  const line2 = words.slice(bestIdx).join(' ');
  return `${line1}\n${line2}`;
}

/**
 * Normalizes raw Whisper transcription JSON into full-sentence, sanitized SRT cues.
 * 
 * @param {object|string} rawJson - Parsed JSON object or raw JSON string
 * @param {object} [options]
 * @param {number} [options.maxSilenceGapMs=750] - Maximum gap to merge sentence fragments
 * @param {number} [options.minCueDurationMs=1200] - Minimum cue display duration in ms
 * @param {number} [options.maxCueDurationMs=7000] - Maximum cue display duration in ms
 * @param {number} [options.maxCharsPerLine=42] - Maximum character length per line before wrap
 * @param {number} [options.msPerWord=350] - Reading speed calculation in ms per word
 * @returns {Array<{ index: string, start: string, end: string, timestamp: string, text: string }>}
 */
export function normalizeTranscriptionJson(rawJson, options = {}) {
  const data = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
  const rawSegments = data?.transcription || [];
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) return [];

  const {
    maxSilenceGapMs = 750,
    minCueDurationMs = 1200,
    maxCueDurationMs = 7000,
    maxCharsPerLine = 42,
    msPerWord = 350,
  } = options;

  // 1. Filter out pure music/noise tokens and extract ms timestamps
  const cleanedSegments = [];
  for (const seg of rawSegments) {
    let text = (seg.text || '').trim();
    if (!text) continue;

    const isMusicOrSymbolOnly = /^[\s♪♫🎵#\*\-\.\,\!\?_~]+$/i.test(text) ||
      /^(\[|\()?(\s*music\s*|\s*applause\s*|\s*singing\s*|\s*laughter\s*|\s*cheering\s*)(\]|\))?$/i.test(text);
    if (isMusicOrSymbolOnly) continue;

    text = text.replace(/^[♪♫🎵\s]+|[♪♫🎵\s]+$/g, '').trim();
    if (!text) continue;

    let startMs = seg.offsets?.from;
    let endMs = seg.offsets?.to;

    if (startMs === undefined && seg.timestamps?.from) {
      startMs = timeToMs(seg.timestamps.from);
    }
    if (endMs === undefined && seg.timestamps?.to) {
      endMs = timeToMs(seg.timestamps.to);
    }

    if (startMs === undefined || endMs === undefined) continue;
    if (endMs <= startMs) {
      endMs = startMs + 1000;
    }

    cleanedSegments.push({
      startMs,
      endMs,
      text,
    });
  }

  if (cleanedSegments.length === 0) return [];

  // 2. Aggregate segments into full sentences based on punctuation & gap
  const aggregatedCues = [];
  let currentCue = null;

  for (let i = 0; i < cleanedSegments.length; i++) {
    const nextSeg = cleanedSegments[i];

    if (!currentCue) {
      currentCue = {
        startMs: nextSeg.startMs,
        endMs: nextSeg.endMs,
        text: nextSeg.text,
      };
      continue;
    }

    const gap = nextSeg.startMs - currentCue.endMs;
    const combinedDuration = nextSeg.endMs - currentCue.startMs;
    const isCurrentTerminal = isSentenceTerminal(currentCue.text);
    const isNextSpeakerTurn = isSpeakerTurn(nextSeg.text);

    // Merge conditions:
    // 1. Current buffer is NOT a completed sentence
    // 2. Silence gap <= maxSilenceGapMs
    // 3. Next segment does NOT start with a speaker turn dash (- )
    // 4. Combined duration <= maxCueDurationMs
    const shouldMerge = !isCurrentTerminal &&
      gap <= maxSilenceGapMs &&
      !isNextSpeakerTurn &&
      combinedDuration <= maxCueDurationMs;

    if (shouldMerge) {
      currentCue.text = `${currentCue.text} ${nextSeg.text}`.trim();
      currentCue.endMs = nextSeg.endMs;
    } else {
      aggregatedCues.push(currentCue);
      currentCue = {
        startMs: nextSeg.startMs,
        endMs: nextSeg.endMs,
        text: nextSeg.text,
      };
    }
  }

  if (currentCue) {
    aggregatedCues.push(currentCue);
  }

  // 3. Post-process: enforce minimum readable duration and word-adaptive timing
  for (let i = 0; i < aggregatedCues.length; i++) {
    const cue = aggregatedCues[i];
    const duration = cue.endMs - cue.startMs;
    const wordCount = (cue.text.match(/\S+/g) || []).length;
    const neededDuration = Math.max(minCueDurationMs, wordCount * msPerWord);

    if (duration < neededDuration) {
      cue.endMs = cue.startMs + Math.min(neededDuration, maxCueDurationMs);
    }
  }

  // 4. Non-overlapping pass: ensure cue end never steps over the next cue start
  for (let i = 0; i < aggregatedCues.length - 1; i++) {
    const curr = aggregatedCues[i];
    const next = aggregatedCues[i + 1];
    if (curr.endMs > next.startMs) {
      const adjustedEndMs = Math.max(curr.startMs + 600, next.startMs - 50);
      curr.endMs = adjustedEndMs;
    }
  }

  // 5. Final pass: apply smart line wrapping and format standard SRT objects
  const finalEntries = aggregatedCues.map((cue, idx) => {
    const formattedText = balanceSubtitleLines(cue.text, maxCharsPerLine);
    const startStr = msToTime(cue.startMs);
    const endStr = msToTime(cue.endMs);

    return {
      index: String(idx + 1),
      start: startStr,
      end: endStr,
      timestamp: `${startStr} --> ${endStr}`,
      text: formattedText,
    };
  });

  return finalEntries;
}

/**
 * Reads Whisper JSON file, normalizes into full sentences, and writes to target SRT path.
 * 
 * @param {string} jsonFilePath - Path to Whisper .json output
 * @param {string} outSrtPath - Target .srt file path
 * @param {object} [options]
 * @returns {Array<{ index: string, start: string, end: string, timestamp: string, text: string }>}
 */
export function normalizeSrtFromJson(jsonFilePath, outSrtPath, options = {}) {
  if (!fs.existsSync(jsonFilePath)) {
    throw new Error(`Whisper JSON output file not found at: ${jsonFilePath}`);
  }

  const content = fs.readFileSync(jsonFilePath, 'utf-8');
  const entries = normalizeTranscriptionJson(content, options);
  const srtContent = stringifySrt(entries);
  fs.writeFileSync(outSrtPath, srtContent, 'utf-8');

  return entries;
}
