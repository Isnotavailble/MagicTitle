import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { PROJECT_ROOT } from '../config.js';
import { resolvePaths, generateSafeHash } from './paths.js';

/**
 * Validates whether an input string is a valid video URL.
 * @param {string} rawUrl
 * @returns {{ isValid: boolean, error?: string, sanitizedUrl?: string }}
 */
export function validateVideoUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { isValid: false, error: 'URL cannot be empty.' };
  }

  const trimmed = rawUrl.trim();

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      error: 'Invalid URL format. Please include http:// or https:// (e.g. https://youtu.be/...)',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      isValid: false,
      error: 'Invalid protocol. URL must start with http:// or https://',
    };
  }

  if (!parsed.hostname || !parsed.hostname.includes('.')) {
    return {
      isValid: false,
      error: 'Invalid domain name in URL.',
    };
  }

  return {
    isValid: true,
    sanitizedUrl: trimmed,
  };
}

/**
 * Downloads a video by executing yt-dlp.exe as an isolated child process.
 * Stores downloaded videos with the format <title>_<id>.mp4.
 * @param {string} url
 * @param {object} options
 * @param {string} [options.outputDir]
 * @param {function} [options.onProgress] - ({ percent, speed, eta, totalSize, statusText }) => void
 * @param {function} [options.onLog] - (msg: string) => void
 * @returns {Promise<object>} Video entry compatible with fileScanner
 */
export function downloadVideo(url, options = {}) {
  const { outputDir = path.join(PROJECT_ROOT, 'testContents'), onProgress, onLog } = options;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const { ytdlpBin, ffmpegBin, hasYtDlp } = resolvePaths();

  if (!hasYtDlp && !fs.existsSync(ytdlpBin)) {
    return Promise.reject(
      new Error(`yt-dlp binary was not found. Please ensure yt-dlp.exe exists in "${path.join(PROJECT_ROOT, 'ytdlp')}" or system PATH.`)
    );
  }

  const ffmpegDir = path.dirname(ffmpegBin);

  return new Promise((resolve, reject) => {
    // Record existing video files in outputDir before starting
    const initialFiles = new Set(
      fs.existsSync(outputDir)
        ? fs.readdirSync(outputDir).filter(f => /\.(mp4|mkv|mov|webm|avi)$/i.test(f))
        : []
    );

    // Save with <title>_<id>.<ext> pattern
    const args = [
      '--no-update',
      '--no-playlist',
      '--newline',
      '--no-mtime',
      '--extractor-args', 'youtube:player_client=android,ios',
      '--retries', '3',
      '--fragment-retries', '3',
      '--ffmpeg-location', ffmpegDir,
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', path.join(outputDir, '%(title)s_%(id)s.%(ext)s'),
      url,
    ];

    if (onLog) onLog(`Executing yt-dlp.exe for: ${url}`);

    const child = spawn(ytdlpBin, args);
    let capturedDestination = null;
    let fullStderr = '';
    let lineBuffer = '';

    const processLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Match destination filename
      const destMatch = trimmed.match(/Destination:\s*(.+)$/i);
      const mergerMatch = trimmed.match(/Merging formats into ["'](.+?)["']/i);
      const alreadyMatch = trimmed.match(/^\[download\]\s+(.+?)\s+has already been downloaded/i);

      if (mergerMatch) capturedDestination = mergerMatch[1].trim();
      else if (destMatch) capturedDestination = destMatch[1].trim();
      else if (alreadyMatch) capturedDestination = alreadyMatch[1].trim();

      // Match progress: [download]  45.2% of ~32.50MiB at 4.50MiB/s ETA 00:06
      const progressMatch = trimmed.match(/\[download\]\s+([\d\.]+)%\s+of\s+~?([\w\.\s]+)\s+at\s+([\w\./]+)\s+ETA\s+([\d:]+)/i);
      if (progressMatch) {
        const percent = parseFloat(progressMatch[1]) || 0;
        const totalSize = progressMatch[2].trim();
        const speed = progressMatch[3].trim();
        const eta = progressMatch[4].trim();

        if (onProgress) {
          onProgress({
            percent,
            totalSize,
            speed,
            eta,
            statusText: `${percent.toFixed(1)}% of ${totalSize} @ ${speed} (ETA ${eta})`,
          });
        }
        return;
      }

      // Simple percent match fallback: [download]  100%
      const simplePercentMatch = trimmed.match(/\[download\]\s+([\d\.]+)%/i);
      if (simplePercentMatch && onProgress) {
        const percent = parseFloat(simplePercentMatch[1]) || 0;
        onProgress({
          percent,
          speed: '',
          eta: '',
          totalSize: '',
          statusText: `${percent.toFixed(1)}%`,
        });
      }

      // Capture high-level informational lines
      if (trimmed.startsWith('[info]') || trimmed.startsWith('[Merger]')) {
        if (onLog) {
          onLog(trimmed);
        }
      }
    };

    child.stdout.on('data', data => {
      lineBuffer += data.toString();
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop();
      for (const l of lines) {
        processLine(l);
      }
    });

    child.stderr.on('data', data => {
      const s = data.toString();
      fullStderr += s;
      const lines = s.split(/\r?\n/);
      for (const l of lines) {
        processLine(l);
      }
    });

    child.on('close', code => {
      if (lineBuffer.trim()) {
        processLine(lineBuffer.trim());
      }

      if (code !== 0) {
        let errorMsg = `yt-dlp exited with error code ${code}.`;
        if (fullStderr.includes('HTTP Error 403')) {
          errorMsg = 'Video download blocked by host (HTTP 403 Forbidden).';
        } else if (fullStderr.includes('Private video')) {
          errorMsg = 'Video is private and cannot be downloaded.';
        } else if (fullStderr.includes('Video unavailable') || fullStderr.includes('This video has been removed')) {
          errorMsg = 'Video is unavailable or has been removed.';
        } else if (fullStderr.includes('Sign in to confirm your age')) {
          errorMsg = 'Video is age-restricted and requires account authentication.';
        } else if (fullStderr.includes('HTTP Error 404')) {
          errorMsg = 'Video URL not found (404).';
        } else if (fullStderr.includes('Unable to download webpage') || fullStderr.includes('Network is unreachable')) {
          errorMsg = 'Network error: Unable to reach video host. Please check your internet connection.';
        } else if (fullStderr.trim()) {
          const errLines = fullStderr
            .trim()
            .split(/\r?\n/)
            .filter(l => !l.includes('To suppress this warning') && !l.includes('--no-update') && !l.includes('See  https://'));
          const errorOnly = errLines.filter(l => l.toUpperCase().includes('ERROR:'));
          if (errorOnly.length > 0) {
            errorMsg = errorOnly.join(' ');
          } else if (errLines.length > 0) {
            errorMsg = errLines.slice(-2).join(' ');
          }
        }
        return reject(new Error(errorMsg));
      }

      // Identify downloaded file
      let finalFilePath = null;
      if (capturedDestination && fs.existsSync(capturedDestination)) {
        finalFilePath = capturedDestination;
      } else {
        const currentFiles = fs.readdirSync(outputDir).filter(f => /\.(mp4|mkv|mov|webm|avi)$/i.test(f));
        const newFiles = currentFiles.filter(f => !initialFiles.has(f));
        if (newFiles.length > 0) {
          const sorted = newFiles.map(f => ({
            name: f,
            fullPath: path.join(outputDir, f),
            mtime: fs.statSync(path.join(outputDir, f)).mtimeMs,
          })).sort((a, b) => b.mtime - a.mtime);
          finalFilePath = sorted[0].fullPath;
        } else if (currentFiles.length > 0) {
          const sorted = currentFiles.map(f => ({
            name: f,
            fullPath: path.join(outputDir, f),
            mtime: fs.statSync(path.join(outputDir, f)).mtimeMs,
          })).sort((a, b) => b.mtime - a.mtime);
          finalFilePath = sorted[0].fullPath;
        }
      }

      if (!finalFilePath || !fs.existsSync(finalFilePath)) {
        return reject(new Error('Download finished but output video file could not be located on disk.'));
      }

      const fileName = path.basename(finalFilePath);
      const ext = path.extname(finalFilePath).toLowerCase();
      const baseName = path.basename(finalFilePath, ext);
      const safeId = generateSafeHash(fileName, 8);
      const enSrtPath = path.join(outputDir, `${baseName}.srt`);
      const mySrtPath = path.join(outputDir, `${baseName}_my.srt`);
      const subtitledVideoPath = path.join(outputDir, `${baseName}_subtitled${ext}`);
      const mySubtitledVideoPath = path.join(outputDir, `${baseName}_my_subtitled${ext}`);

      const hasEnSrt = fs.existsSync(enSrtPath);
      const hasMySrt = fs.existsSync(mySrtPath);
      const hasOutputVideo = fs.existsSync(subtitledVideoPath) || fs.existsSync(mySubtitledVideoPath);

      const videoEntry = {
        fileName,
        fullPath: finalFilePath,
        dir: outputDir,
        baseName,
        ext,
        safeId,
        hasEnSrt,
        enSrtPath,
        hasMySrt,
        mySrtPath,
        hasOutputVideo,
        statusBadges: {
          en: hasEnSrt,
          my: hasMySrt,
          subtitled: hasOutputVideo,
        },
      };

      if (onProgress) {
        onProgress({
          percent: 100,
          speed: '',
          eta: '00:00',
          totalSize: '',
          statusText: `Completed: ${fileName}`,
        });
      }

      if (onLog) onLog(`Download complete: ${fileName}`);
      resolve(videoEntry);
    });

    child.on('error', err => {
      reject(new Error(`Failed to spawn yt-dlp.exe process: ${err.message}`));
    });
  });
}
