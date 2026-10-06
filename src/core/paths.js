import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from '../config.js';

export function resolvePaths() {
  // 1. FFmpeg Binary
  const ffmpegCandidates = [
    path.join(PROJECT_ROOT, 'ffmpeg-8.1-essentials_build', 'ffmpeg-8.1-essentials_build', 'bin', 'ffmpeg.exe'),
    path.join(PROJECT_ROOT, 'ffmpeg-8.1-essentials_build', 'bin', 'ffmpeg.exe'),
  ];
  let ffmpegBin = ffmpegCandidates.find(p => fs.existsSync(p)) || 'ffmpeg';

  // 2. Whisper Binary
  const whisperCandidates = [
    path.join(PROJECT_ROOT, 'whisper-bin-x64', 'Release', 'whisper-cli.exe'),
    path.join(PROJECT_ROOT, 'whisper-bin-x64', 'Release', 'main.exe'),
    path.join(PROJECT_ROOT, 'whisper-bin-x64', 'whisper-cli.exe'),
  ];
  let whisperBin = whisperCandidates.find(p => fs.existsSync(p)) || null;

  // 3. Model File
  const modelCandidates = [
    path.join(PROJECT_ROOT, 'models', 'ggml-small-q5_1.bin'),
    path.join(PROJECT_ROOT, 'models', 'ggml-small.en.bin'),
    path.join(PROJECT_ROOT, 'models', 'ggml-base.bin'),
  ];
  let modelFile = modelCandidates.find(p => fs.existsSync(p)) || null;

  // 4. Fonts Directory & Padauk
  const fontsDir = path.join(PROJECT_ROOT, 'fonts', 'Padauk');
  const padaukFont = path.join(fontsDir, 'Padauk-Regular.ttf');

  return {
    projectRoot: PROJECT_ROOT,
    ffmpegBin,
    whisperBin,
    modelFile,
    fontsDir,
    padaukFont,
    hasFFmpeg: fs.existsSync(ffmpegBin) || ffmpegBin === 'ffmpeg',
    hasWhisper: Boolean(whisperBin && fs.existsSync(whisperBin)),
    hasModel: Boolean(modelFile && fs.existsSync(modelFile)),
    hasPadaukFont: fs.existsSync(padaukFont),
  };
}
