import path from 'path';
import fs from 'fs';
import { extractAudio } from './ffmpeg.js';
import { transcribeAudio } from './whisper.js';
import { extractKeywordsFromTranscript } from './keywordExtractor.js';
import { readSrtFile, sanitizeSrtEntries } from './srt.js';
import { generateSafeHash } from './paths.js';
import { MODEL_PROFILES } from '../config.js';

/**
 * Runs the fast tiny.en metadata probe pass on a video.
 * Extracts speech-isolated audio, scans vocabulary, and generates <video_name>_prompt.txt.
 * 
 * @param {string} videoPath - Full path to target video file
 * @param {object} [options]
 * @param {function} [options.onLog] - Log output callback
 * @param {function} [options.onProgress] - Probe transcription progress callback
 * @param {number} [options.maxKeywords=40] - Maximum keyword count
 * @returns {Promise<{ promptText: string, promptPath: string, tempPromptPath: string, safeId: string, keywordCount: number }>}
 */
export async function runMetadataProbe(videoPath, options = {}) {
  const onLog = options.onLog || (() => {});
  const onProgress = options.onProgress || (() => {});
  const maxKeywords = options.maxKeywords || 40;

  const dir = path.dirname(videoPath);
  const ext = path.extname(videoPath);
  const baseName = path.basename(videoPath, ext);
  const safeId = generateSafeHash(videoPath, 8);

  const tinyProfile = MODEL_PROFILES['tiny-en'];
  if (!tinyProfile) {
    throw new Error('tiny-en model profile was not found in MODEL_PROFILES configuration.');
  }

  // Intermediate safe-ID file paths
  const tempProbeWav = path.join(dir, `_temp_${safeId}_probe_16k.wav`);
  const tempProbePrefix = path.join(dir, `_temp_${safeId}_probe`);
  const tempProbeSrt = path.join(dir, `_temp_${safeId}_probe.srt`);
  const tempPromptPath = path.join(dir, `_temp_${safeId}_prompt.txt`);
  const userPromptPath = path.join(dir, `${baseName}_prompt.txt`);

  try {
    // 1. Extract audio stream for probe with RNNoise vocal isolation
    onLog(`[Probe 1/3] Extracting speech-isolated audio with RNNoise for tiny.en probe...`);
    await extractAudio(videoPath, tempProbeWav, { modelProfile: tinyProfile });

    // 2. Run fast greedy scan with tiny.en
    onLog(`[Probe 2/3] Scanning vocabulary with tiny.en probe model...`);
    await transcribeAudio(
      tempProbeWav,
      tempProbePrefix,
      { modelProfile: tinyProfile, language: 'en' },
      onProgress
    );

    // 3. Read and sanitize probe SRT cues
    let cleanTranscriptText = '';
    if (fs.existsSync(tempProbeSrt)) {
      const rawCues = readSrtFile(tempProbeSrt);
      const sanitizedCues = sanitizeSrtEntries(rawCues);
      cleanTranscriptText = sanitizedCues.map(c => c.text).filter(Boolean).join(' ');
    }

    // 4. Tokenize & harvest proper nouns / domain keywords
    onLog(`[Probe 3/3] Tokenizing and generating natural dialogue context prompt...`);
    const promptText = extractKeywordsFromTranscript(cleanTranscriptText);
    const keywordCount = promptText ? (promptText.match(/\b[A-Za-z0-9'-]+\b/g) || []).length : 0;

    // 5. Save prompt artifacts
    fs.writeFileSync(tempPromptPath, promptText, 'utf-8');
    fs.writeFileSync(userPromptPath, promptText, 'utf-8');

    onLog(`✓ [Probe Success] Generated Dynamic Prompt -> Saved to ${path.basename(userPromptPath)}`);

    return {
      promptText,
      promptPath: userPromptPath,
      tempPromptPath,
      safeId,
      keywordCount,
    };
  } finally {
    // Clean up temporary probe intermediate WAV & SRT
    if (fs.existsSync(tempProbeWav)) {
      try { fs.unlinkSync(tempProbeWav); } catch {}
    }
    if (fs.existsSync(tempProbeSrt)) {
      try { fs.unlinkSync(tempProbeSrt); } catch {}
    }
  }
}
