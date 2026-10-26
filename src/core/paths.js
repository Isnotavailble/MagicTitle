import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PROJECT_ROOT, MODEL_PROFILES } from '../config.js';

/**
 * Generates an 8-character safe ASCII hexadecimal hash from any input string.
 * @param {string} input
 * @param {number} [length=8]
 * @returns {string}
 */
export function generateSafeHash(input, length = 8) {
  if (!input) return '00000000';
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, length);
}

export function resolveModelFile(language = 'en') {
  const modelsDir = path.join(PROJECT_ROOT, 'models');
  // Check available models from MODEL_PROFILES
  for (const profile of Object.values(MODEL_PROFILES)) {
    if (!profile?.fileName) continue;
    const p = path.join(modelsDir, profile.fileName);
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Dynamically resolves the FFmpeg executable without hardcoding package version names.
 * Scans direct, bin/, and any extracted subfolder within PROJECT_ROOT/ffmpeg.
 * @returns {string} Path to ffmpeg executable or 'ffmpeg' for PATH fallback.
 */
export function findFfmpegBinary() {
  const ffmpegDir = path.join(PROJECT_ROOT, 'ffmpeg');

  if (fs.existsSync(ffmpegDir)) {
    // 1. Direct inside ffmpeg/
    const directBin = path.join(ffmpegDir, 'bin', 'ffmpeg.exe');
    if (fs.existsSync(directBin)) return directBin;

    const directRoot = path.join(ffmpegDir, 'ffmpeg.exe');
    if (fs.existsSync(directRoot)) return directRoot;

    // 2. Dynamic inspection of ANY extracted folder name (e.g. ffmpeg-8.1-essentials_build, ffmpeg-master, etc.)
    try {
      const subEntries = fs.readdirSync(ffmpegDir, { withFileTypes: true });
      for (const entry of subEntries) {
        if (entry.isDirectory()) {
          // Check <folder>/bin/ffmpeg.exe (standard Gyan.dev / official build layout)
          const nestedBin = path.join(ffmpegDir, entry.name, 'bin', 'ffmpeg.exe');
          if (fs.existsSync(nestedBin)) return nestedBin;

          // Check nested <folder>/<folder>/bin/ffmpeg.exe (double-nested zip extractions)
          const doubleNestedBin = path.join(ffmpegDir, entry.name, entry.name, 'bin', 'ffmpeg.exe');
          if (fs.existsSync(doubleNestedBin)) return doubleNestedBin;

          // Check <folder>/ffmpeg.exe
          const nestedRoot = path.join(ffmpegDir, entry.name, 'ffmpeg.exe');
          if (fs.existsSync(nestedRoot)) return nestedRoot;
        }
      }
    } catch {
      // Ignore read errors and proceed to fallbacks
    }
  }

  // 3. Fallbacks for existing workspaces / system PATH
  const fallbackCandidates = [
    path.join(PROJECT_ROOT, 'ytdlp', 'ffmpeg.exe'),
    path.join(PROJECT_ROOT, 'bin', 'ffmpeg.exe'),
  ];
  const foundFallback = fallbackCandidates.find(p => fs.existsSync(p));
  if (foundFallback) return foundFallback;

  return 'ffmpeg';
}

export function resolvePaths(language = 'en') {
  // 1. FFmpeg Binary (dynamically resolved)
  const ffmpegBin = findFfmpegBinary();

  // 2. yt-dlp Binary
  const ytdlpCandidates = [
    path.join(PROJECT_ROOT, 'ytdlp', 'yt-dlp.exe'),
    path.join(PROJECT_ROOT, 'ytdlp', 'yt-dlp'),
    path.join(PROJECT_ROOT, 'bin', 'yt-dlp.exe'),
  ];
  let ytdlpBin = ytdlpCandidates.find(p => fs.existsSync(p)) || 'yt-dlp';

  // 3. Whisper Binary
  const whisperCandidates = [
    path.join(PROJECT_ROOT, 'whisper-bin-x64', 'Release', 'whisper-cli.exe'),
    path.join(PROJECT_ROOT, 'whisper-bin-x64', 'Release', 'main.exe'),
    path.join(PROJECT_ROOT, 'whisper-bin-x64', 'whisper-cli.exe'),
  ];
  let whisperBin = whisperCandidates.find(p => fs.existsSync(p)) || null;

  // 4. Model File (Routed by language)
  let modelFile = resolveModelFile(language);

  // 4b. Silero VAD Model File
  const vadCandidates = [
    path.join(PROJECT_ROOT, 'models', 'ggml-silero-v6.2.0.bin')
  ];
  let vadModelFile = vadCandidates.find(p => fs.existsSync(p)) || null;

  // 4c. RNNoise Denoise Model File (bd.rnnn / somafm.rnnn)
  const rnnCandidates = [
    path.join(PROJECT_ROOT, 'models', 'bd.rnnn'),
    path.join(PROJECT_ROOT, 'models', 'somafm.rnnn'),
  ];
  let rnnModelFile = rnnCandidates.find(p => fs.existsSync(p)) || null;

  // 5. Fonts Directory & Padauk
  const fontsDir = path.join(PROJECT_ROOT, 'fonts', 'Padauk');
  const padaukFont = path.join(fontsDir, 'Padauk-Regular.ttf');

  return {
    projectRoot: PROJECT_ROOT,
    ffmpegBin,
    ytdlpBin,
    whisperBin,
    modelFile,
    vadModelFile,
    rnnModelFile,
    fontsDir,
    padaukFont,
    hasFFmpeg: fs.existsSync(ffmpegBin) || ffmpegBin === 'ffmpeg',
    hasYtDlp: fs.existsSync(ytdlpBin) || ytdlpBin === 'yt-dlp',
    hasWhisper: Boolean(whisperBin && fs.existsSync(whisperBin)),
    hasModel: Boolean(modelFile && fs.existsSync(modelFile)),
    hasVadModel: Boolean(vadModelFile && fs.existsSync(vadModelFile)),
    hasRnnModel: Boolean(rnnModelFile && fs.existsSync(rnnModelFile)),
    hasPadaukFont: fs.existsSync(padaukFont),
  };
}