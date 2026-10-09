import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from '../config.js';
import { generateSafeHash } from './paths.js';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm']);

export function scanDirectoryForVideos(dirPath) {
  const targetDir = dirPath || path.join(PROJECT_ROOT, 'testContents');
  if (!fs.existsSync(targetDir)) return [];

  const files = fs.readdirSync(targetDir);
  const videoEntries = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (VIDEO_EXTENSIONS.has(ext)) {
      // Exclude already subtitled output videos from being listed as primary source
      if (file.includes('_subtitled') || file.includes('_my_subtitled')) {
        continue;
      }

      const fullPath = path.join(targetDir, file);
      const baseName = path.basename(file, ext);
      const safeId = generateSafeHash(file, 8);
      const enSrtPath = path.join(targetDir, `${baseName}.srt`);
      const mySrtPath = path.join(targetDir, `${baseName}_my.srt`);
      const subtitledVideoPath = path.join(targetDir, `${baseName}_subtitled${ext}`);
      const mySubtitledVideoPath = path.join(targetDir, `${baseName}_my_subtitled${ext}`);

      const hasEnSrt = fs.existsSync(enSrtPath);
      const hasMySrt = fs.existsSync(mySrtPath);
      const hasOutputVideo = fs.existsSync(subtitledVideoPath) || fs.existsSync(mySubtitledVideoPath);

      const promptPath = path.join(targetDir, `${baseName}_prompt.txt`);
      const hasPrompt = fs.existsSync(promptPath);

      videoEntries.push({
        fileName: file,
        fullPath,
        dir: targetDir,
        baseName,
        ext,
        safeId,
        hasEnSrt,
        enSrtPath,
        hasMySrt,
        mySrtPath,
        hasPrompt,
        promptPath,
        hasOutputVideo,
        statusBadges: {
          en: hasEnSrt,
          my: hasMySrt,
          prompt: hasPrompt,
          subtitled: hasOutputVideo,
        },
      });
    }
  }

  return videoEntries;
}

export function deleteSubtitleFiles(videoEntry) {
  const deleted = [];
  if (videoEntry.hasEnSrt && fs.existsSync(videoEntry.enSrtPath)) {
    fs.unlinkSync(videoEntry.enSrtPath);
    deleted.push(videoEntry.enSrtPath);
  }
  if (videoEntry.hasMySrt && fs.existsSync(videoEntry.mySrtPath)) {
    fs.unlinkSync(videoEntry.mySrtPath);
    deleted.push(videoEntry.mySrtPath);
  }
  return deleted;
}
