import { translateWithGoogle } from './googleService.js';
import { translateWithGroq } from './groqService.js';
import { parseSrt, stringifySrt, readSrtFile, writeSrtFile } from '../core/srt.js';
import { CONFIG } from '../config.js';

export function buildSystemPrompt(contextPrompt = null) {
  let contextSection = '';
  if (contextPrompt && typeof contextPrompt === 'string' && contextPrompt.trim()) {
    contextSection = `
Scene & Character Context:
${contextPrompt.trim()}

CRITICAL BURMESE PRONOUN & GENDER RULES:
- Use the character context above to identify who is speaking and who is addressed in the dialogue.
- Use natural spoken Burmese pronouns matching each character's gender, role, and relationship:
  * Female characters (e.g. Diana, women): Use feminine pronouns/forms (ကျွန်မ, ငါ, ရှင်, ရှင့်). Never assign male pronouns (ကျွန်တော်) or male particles (ဗျာ, ခင်ဗျ) to female speakers!
  * Male characters (e.g. Bruce/Batman, men): Use masculine pronouns/forms (ကျွန်တော်, ငါ, ခင်ဗျား, မင်း, သူ, ဗျ, ဗျာ).
  * Royal & Respect honorifics: When addressing a princess or royal warrior (e.g. Princess Diana), use appropriate respectful titles (မင်းသမီး) instead of generic or disrespectful forms.
`;
  }

  return `You are a professional film subtitle translator.
The input consists of indexed lines formatted as: <index>|||<English dialogue>
You should not change the sequence number all the sequence index should match even when the sentence is break into words. You should respect the <index>|||<English dialogue> sequences of original file.
Task: Translate every single line into natural conversational spoken Myanmar Unicode (စကားပြောစစ်စစ်).
${contextSection}
Strict Rules:
1. Maintain the exact line format: <index>|||<Myanmar translated text>
2. Never drop or modify the numeric index or the '|||' separator.
3. Avoid formal/bookish Burmese (never use သည်, ၏, ၌, ပါသည်). Use spoken colloquial endings (တယ်, ပါ, ဖြစ်လို့လေ, ဗျာ, ရှင်, ရှင့်).
4. Script Purity: Use Myanmar Unicode (English words/acronyms are allowed when appropriate). Never insert Chinese (漢字), Thai, Hindi, or other non-Myanmar scripts.
5. Do NOT omit, skip, or summarize any index. Every single provided index MUST be returned in order.
6. Output clean plain text only. Do not add markdown fences (no \`\`\`), conversational intros, or notes.`;
}

export const SWIFT_SYSTEM_PROMPT = buildSystemPrompt();

export async function translateSrtFile(inputSrtPath, outputSrtPath, options = {}) {
  const provider = options.provider || CONFIG.defaultService || 'google';
  const batchSize = options.batchSize || CONFIG.batchSize || 45;
  const contextPrompt = options.contextPrompt || null;
  const onProgress = options.onProgress || null;
  const onLog = options.onLog || (() => {});
  const systemPrompt = buildSystemPrompt(contextPrompt);

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
          batchResult = await translateWithGroq(requestBody, options.apiKey, systemPrompt);
        } else {
          batchResult = await translateWithGoogle(requestBody, options.apiKey, systemPrompt);
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
  let fallbackCount = 0;
  const finalCues = entries.map((orig, i) => {
    const origNumericIdx = parseInt(orig.index, 10);
    const translatedText =
      translatedMap.get(i) ||
      translatedMap.get(i + 1) ||
      (!isNaN(origNumericIdx) ? translatedMap.get(origNumericIdx) : null) ||
      orig.text;

    if (
      !translatedMap.has(i) &&
      !translatedMap.has(i + 1) &&
      (isNaN(origNumericIdx) || !translatedMap.has(origNumericIdx))
    ) {
      fallbackCount++;
    }

    return {
      index: orig.index,
      start: orig.start,
      end: orig.end,
      timestamp: orig.timestamp,
      text: translatedText,
    };
  });

  if (fallbackCount > 0) {
    onLog(`[Warning] ${fallbackCount} cue(s) could not be mapped to LLM response and retained original text.`);
  }

  writeSrtFile(outputSrtPath, finalCues);
  onLog(`[Success] Saved ${finalCues.length} cues into ${outputSrtPath}`);
  return { outputSrtPath, cueCount: finalCues.length };
}
