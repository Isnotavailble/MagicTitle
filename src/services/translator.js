import { translateWithGoogle } from './googleService.js';
import { translateWithGroq } from './groqService.js';
import { parseSrt, stringifySrt, readSrtFile, writeSrtFile } from '../core/srt.js';
import { CONFIG } from '../config.js';

export async function translateSrtFile(inputSrtPath, outputSrtPath, options = {}) {
  const provider = options.provider || CONFIG.defaultService || 'google';
  const batchSize = options.batchSize || CONFIG.batchSize || 45;
  const onProgress = options.onProgress || null;
  const onLog = options.onLog || (() => {});

  onLog(`Reading input subtitles from ${inputSrtPath}...`);
  const entries = readSrtFile(inputSrtPath);
  if (!entries || entries.length === 0) {
    onLog(`[ERROR] No subtitle cues found in ${inputSrtPath}`);
    throw new Error('No valid subtitle cues found in input SRT file.');
  }

  const total = entries.length;
  onLog(`Parsed ${total} cues. Using provider: ${provider.toUpperCase()}`);
  const translatedMap = new Map();
  const indexedEntries = entries.map((entry, idx) => ({ idx, entry }));
  const totalBatches = Math.ceil(total / batchSize);

  for (let start = 0, batchNum = 1; start < total; start += batchSize, batchNum++) {
    const batch = indexedEntries.slice(start, start + batchSize);
    const payloadLines = batch.map(b => `${b.idx}|||${b.entry.text}`);
    const requestBody = payloadLines.join('\n');
    const startCue = start + 1;
    const endCue = Math.min(start + batchSize, total);

    onLog(`[Batch ${batchNum}/${totalBatches}] Sending cues ${startCue}..${endCue} to ${provider.toUpperCase()}...`);

    if (onProgress) {
      onProgress({
        batchNum,
        totalBatches,
        startCue,
        endCue,
        totalCues: total,
        provider,
      });
    }

    let batchResult = '';
    let success = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!success && attempts < maxAttempts) {
      attempts++;
      try {
        if (provider === 'groq') {
          batchResult = await translateWithGroq(requestBody, options.apiKey);
        } else {
          batchResult = await translateWithGoogle(requestBody, options.apiKey);
        }
        success = true;
        onLog(`[Batch ${batchNum}/${totalBatches}] Received translation from ${provider.toUpperCase()}`);
      } catch (err) {
        onLog(`[Batch ${batchNum} Warning] Attempt ${attempts} failed: ${err.message}`);
        if (attempts >= maxAttempts) {
          onLog(`[Batch ${batchNum} Error] All attempts exhausted. Retaining original English dialogue.`);
        } else {
          await new Promise(r => setTimeout(r, 2000 * attempts));
        }
      }
    }

    if (batchResult) {
      // 1. First try parsing index|||text lines
      const lines = batchResult.split('\n');
      let foundDelimiters = false;
      let parsedCount = 0;

      for (const line of lines) {
        if (line.includes('|||')) {
          foundDelimiters = true;
          const parts = line.split('|||');
          const idx = parseInt(parts[0].trim(), 10);
          if (!isNaN(idx)) {
            translatedMap.set(idx, parts.slice(1).join('|||').trim());
            parsedCount++;
          }
        }
      }

      // 2. If no ||| delimiters found, parse numbered blocks
      if (!foundDelimiters) {
        const blocks = batchResult.trim().split(/\n\s*\n/);
        for (const block of blocks) {
          const bLines = block.trim().split('\n');
          if (bLines.length >= 2) {
            const maybeIdx = parseInt(bLines[0].trim(), 10);
            if (!isNaN(maybeIdx)) {
              const text = bLines.slice(1).join(' ').trim();
              translatedMap.set(maybeIdx, text);
              parsedCount++;
            }
          }
        }
      }
      onLog(`[Batch ${batchNum}/${totalBatches}] Mapped ${parsedCount} Myanmar dialogue cues`);
    }
  }

  // Reconstruct translated SRT preserving exact cue numbers and timestamps
  onLog(`Writing reconstructed Myanmar SRT to ${outputSrtPath}...`);
  const finalCues = entries.map((orig, i) => {
    const translatedText = translatedMap.get(i) || orig.text;
    return {
      index: orig.index,
      start: orig.start,
      end: orig.end,
      timestamp: orig.timestamp,
      text: translatedText,
    };
  });

  writeSrtFile(outputSrtPath, finalCues);
  onLog(`[Success] Saved ${finalCues.length} cues into ${outputSrtPath}`);
  return { outputSrtPath, cueCount: finalCues.length };
}
