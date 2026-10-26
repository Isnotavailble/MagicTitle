import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import OpenAI from 'openai';
import { CONFIG } from '../config.js';
import { resolvePaths } from '../core/paths.js';
import { normalizeTranscriptionJson } from '../core/srtNormalizer.js';
import { writeSrtFile } from '../core/srt.js';

/**
 * Splits a WAV file into timeline-based chunks using FFmpeg fast segmenter (-c copy).
 * Zero re-encoding overhead.
 * @param {string} wavPath - Source 16kHz WAV file.
 * @param {string} outputDir - Directory to store the chunks.
 * @param {number} segmentDurationSec - Duration per segment in seconds (default: 500s).
 * @returns {Promise<Array<{ path: string, offsetSec: number }>>}
 */
export async function splitAudioIntoChunks(wavPath, outputDir, segmentDurationSec = 500) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const { ffmpegBin } = resolvePaths();
  const chunkPattern = path.join(outputDir, 'chunk_%03d.wav');

  return new Promise((resolve, reject) => {
    // Slices on exact timeline intervals without changing sample rate or re-encoding
    const args = [
      '-y',
      '-i', wavPath,
      '-f', 'segment',
      '-segment_time', String(segmentDurationSec),
      '-c', 'copy',
      chunkPattern,
    ];

    const child = spawn(ffmpegBin, args);
    let stderr = '';

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`FFmpeg audio chunking failed (exit ${code}): ${stderr.slice(-300)}`));
      }

      // Read resulting chunk files sorted alphabetically
      const files = fs.readdirSync(outputDir)
        .filter(f => /^chunk_\d+\.wav$/i.test(f))
        .sort((a, b) => a.localeCompare(b));

      const chunks = files.map((file, index) => ({
        path: path.join(outputDir, file),
        offsetSec: index * segmentDurationSec,
      }));

      resolve(chunks);
    });

    child.on('error', err => reject(err));
  });
}

/**
 * Sleep helper for rate-limiting protection.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Transcribes a single audio chunk via Groq Cloud API with retry on 429.
 * @param {OpenAI} client
 * @param {string} filePath
 * @param {object} options
 * @param {number} retryCount
 * @returns {Promise<object>} Groq verbose_json response
 */
async function transcribeSingleChunkWithRetry(client, filePath, options = {}, retryCount = 0) {
  const { language = 'en', prompt = null, modelProfile } = options;
  const model = modelProfile?.modelName || CONFIG.cloudWhisper?.model || 'whisper-large-v3-turbo';
  const temperature = modelProfile?.temperature !== undefined ? modelProfile.temperature : 0.0;

  try {
    const fileStream = fs.createReadStream(filePath);
    const response = await client.audio.transcriptions.create({
      file: fileStream,
      model,
      response_format: 'verbose_json',
      temperature,
      language: language === 'auto' ? undefined : language,
      prompt: prompt || undefined,
    });
    return response;
  } catch (error) {
    const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('rate limit');
    const maxRetries = modelProfile?.maxRetries || CONFIG.cloudWhisper?.maxRetries || 3;

    if (isRateLimit && retryCount < maxRetries) {
      const waitTime = (retryCount + 1) * 3000;
      if (options.onLog) {
        options.onLog(`[Cloud Whisper] Rate limit hit (429). Retrying in ${waitTime / 1000}s... (Attempt ${retryCount + 1}/${maxRetries})`);
      }
      await sleep(waitTime);
      return transcribeSingleChunkWithRetry(client, filePath, options, retryCount + 1);
    }
    throw error;
  }
}

/**
 * Transcribes an audio file on Groq Cloud with dynamic chunking, sequential upload, and srtNormalizer formatting.
 *
 * @param {string} wavPath - Path to the 16kHz mono WAV audio file.
 * @param {string} targetSrtPath - Destination path for final .srt.
 * @param {object} options - Options object
 * @param {string} [options.language='en']
 * @param {string} [options.prompt=null]
 * @param {object} [options.modelProfile] - Local model profile to borrow normalization rules from.
 * @param {function} [onProgress] - Live log callback ({ status, cue }) => void.
 * @returns {Promise<string>} Path to final .srt.
 */
export async function transcribeAudioGroqCloud(wavPath, targetSrtPath, options = {}, onProgress = null) {
  const apiKey = (CONFIG.groq?.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('Groq API Key is missing. Please set GROQ_API_KEY in your .env file to use Cloud Transcription.');
  }

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const stats = fs.statSync(wavPath);
  const fileSize = stats.size;
  const activeModel = options.modelProfile || {};
  const maxChunkSize = activeModel.maxChunkSizeBytes || CONFIG.cloudWhisper?.maxChunkSizeBytes || (19 * 1024 * 1024);
  const chunkDurationSec = activeModel.chunkDurationSec || CONFIG.cloudWhisper?.chunkDurationSec || 500;
  const interChunkDelay = activeModel.interChunkDelayMs || CONFIG.cloudWhisper?.interChunkDelayMs || 600;

  const normalizerOptions = {
    maxSilenceGapMs: activeModel.maxSilenceGapMs || 750,
    minCueDurationMs: activeModel.minCueDurationMs || 1200,
    maxCueDurationMs: activeModel.maxCueDurationMs || 7000,
    maxCharsPerLine: activeModel.maxCharsPerLine || 42,
  };

  const log = msg => {
    if (onProgress) onProgress({ status: msg });
  };

  const tempChunksDir = path.join(path.dirname(wavPath), `.temp_chunks_${Date.now()}`);
  const combinedSegments = [];

  try {
    if (fileSize <= maxChunkSize) {
      // Direct single upload
      log(`[Cloud Whisper] Audio size ${(fileSize / (1024 * 1024)).toFixed(1)} MB ≤ 19 MB. Sending direct request...`);
      const response = await transcribeSingleChunkWithRetry(client, wavPath, {
        language: options.language,
        prompt: options.prompt,
        modelProfile: activeModel,
        onLog: log,
      });

      const rawSegments = response?.segments || [];
      for (const seg of rawSegments) {
        const startMs = Math.round((seg.start || 0) * 1000);
        const endMs = Math.round((seg.end || 0) * 1000);
        if (seg.text && seg.text.trim()) {
          combinedSegments.push({
            offsets: { from: startMs, to: endMs },
            text: seg.text.trim(),
          });
        }
      }
    } else {
      // Audio exceeds 19MB: Slice into timeline chunks and upload sequentially
      const totalMin = (fileSize / (32 * 1024 * 60)).toFixed(1);
      log(`[Cloud Whisper] Long audio detected (~${totalMin} min, ${(fileSize / (1024 * 1024)).toFixed(1)} MB). Slicing into ≤19MB chunks...`);

      const chunks = await splitAudioIntoChunks(wavPath, tempChunksDir, chunkDurationSec);
      log(`[Cloud Whisper] Split into ${chunks.length} chunks. Uploading sequentially (one-by-one) to protect 20 RPM limit...`);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkNum = i + 1;
        const percent = Math.round((chunkNum / chunks.length) * 100);

        log(`[Cloud Whisper] Transcribing chunk ${chunkNum}/${chunks.length} (${percent}%)...`);

        const response = await transcribeSingleChunkWithRetry(client, chunk.path, {
          language: options.language,
          prompt: options.prompt,
          modelProfile: activeModel,
          onLog: log,
        });

        const rawSegments = response?.segments || [];
        for (const seg of rawSegments) {
          const startMs = Math.round(((seg.start || 0) + chunk.offsetSec) * 1000);
          const endMs = Math.round(((seg.end || 0) + chunk.offsetSec) * 1000);
          if (seg.text && seg.text.trim()) {
            combinedSegments.push({
              offsets: { from: startMs, to: endMs },
              text: seg.text.trim(),
            });
          }
        }

        // Rolling cleanup of this chunk to save disk space
        try { fs.unlinkSync(chunk.path); } catch {}

        // Polite pause between chunks to respect rate limits
        if (i < chunks.length - 1) {
          await sleep(interChunkDelay);
        }
      }
    }

    log(`[Cloud Whisper] Normalizing full sentences via srtNormalizer...`);
    const finalCues = normalizeTranscriptionJson({ transcription: combinedSegments }, normalizerOptions);

    writeSrtFile(targetSrtPath, finalCues);
    log(`[Cloud Whisper] Subtitles successfully assembled: ${path.basename(targetSrtPath)}`);

    return targetSrtPath;
  } finally {
    // Guaranteed cleanup of temporary chunk directory
    if (fs.existsSync(tempChunksDir)) {
      try {
        fs.rmSync(tempChunksDir, { recursive: true, force: true });
      } catch {}
    }
  }
}
