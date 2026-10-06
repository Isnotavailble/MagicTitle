import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { resolvePaths, generateSafeHash } from './paths.js';
import { writePadaukAssFile } from './fontPatcher.js';
import { readSrtFile } from './srt.js';

function escapeFilterPath(p) {
  // FFmpeg filtergraph escaping: replace \ with / and escape : with \:
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

export function extractAudio(videoPath, outWavPath, onProgress) {
  const { ffmpegBin } = resolvePaths();
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', videoPath,
      '-vn',
      '-af', 'highpass=f=80,lowpass=f=7500,dynaudnorm',
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      outWavPath,
    ];

    const child = spawn(ffmpegBin, args);
    let errorOutput = '';

    child.stderr.on('data', data => {
      const str = data.toString();
      errorOutput += str;
      if (onProgress) {
        const timeMatch = str.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (timeMatch) onProgress({ time: timeMatch[1] });
      }
    });

    child.on('close', code => {
      if (code === 0 && fs.existsSync(outWavPath)) {
        resolve(outWavPath);
      } else {
        reject(new Error(`FFmpeg audio extraction failed (code ${code}): ${errorOutput.slice(-300)}`));
      }
    });

    child.on('error', err => reject(err));
  });
}

export function burnMyanmarSubtitles(videoPath, srtPath, outVideoPath, onProgress) {
  const { ffmpegBin, fontsDir } = resolvePaths();
  const dir = path.dirname(videoPath);
  const safeId = generateSafeHash(videoPath, 8);
  const tempAssPath = path.join(dir, `_temp_${safeId}_my.ass`);

  // Convert SRT cues to ASS with Padauk font header
  const cues = readSrtFile(srtPath);
  writePadaukAssFile(tempAssPath, cues, 'Padauk');

  const escapedAss = escapeFilterPath(tempAssPath);
  const escapedFonts = escapeFilterPath(fontsDir);

  const filterString = `ass='${escapedAss}':fontsdir='${escapedFonts}':shaping=complex`;

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', videoPath,
      '-vf', filterString,
      '-c:a', 'copy',
      outVideoPath,
    ];

    const child = spawn(ffmpegBin, args);
    let errorOutput = '';

    child.stderr.on('data', data => {
      const str = data.toString();
      errorOutput += str;
      if (onProgress) {
        const timeMatch = str.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (timeMatch) onProgress({ time: timeMatch[1] });
      }
    });

    child.on('close', code => {
      if (fs.existsSync(tempAssPath)) {
        try { fs.unlinkSync(tempAssPath); } catch {}
      }

      if (code === 0 && fs.existsSync(outVideoPath)) {
        resolve(outVideoPath);
      } else {
        reject(new Error(`FFmpeg Myanmar subtitle burning failed (code ${code}): ${errorOutput.slice(-300)}`));
      }
    });

    child.on('error', err => {
      if (fs.existsSync(tempAssPath)) {
        try { fs.unlinkSync(tempAssPath); } catch {}
      }
      reject(err);
    });
  });
}

export function burnEnglishSubtitles(videoPath, srtPath, outVideoPath, onProgress) {
  const { ffmpegBin } = resolvePaths();
  const dir = path.dirname(videoPath);
  const safeId = generateSafeHash(videoPath, 8);
  const tempSrtPath = path.join(dir, `_temp_${safeId}_en.srt`);

  // Copy to safe ASCII path to prevent filtergraph escaping bugs on Unicode paths
  fs.copyFileSync(srtPath, tempSrtPath);
  const escapedSrt = escapeFilterPath(tempSrtPath);

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', videoPath,
      '-vf', `subtitles='${escapedSrt}'`,
      '-c:a', 'copy',
      outVideoPath,
    ];

    const child = spawn(ffmpegBin, args);
    let errorOutput = '';

    child.stderr.on('data', data => {
      const str = data.toString();
      errorOutput += str;
      if (onProgress) {
        const timeMatch = str.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (timeMatch) onProgress({ time: timeMatch[1] });
      }
    });

    child.on('close', code => {
      if (fs.existsSync(tempSrtPath)) {
        try { fs.unlinkSync(tempSrtPath); } catch {}
      }

      if (code === 0 && fs.existsSync(outVideoPath)) {
        resolve(outVideoPath);
      } else {
        reject(new Error(`FFmpeg English subtitle burning failed (code ${code}): ${errorOutput.slice(-300)}`));
      }
    });

    child.on('error', err => {
      if (fs.existsSync(tempSrtPath)) {
        try { fs.unlinkSync(tempSrtPath); } catch {}
      }
      reject(err);
    });
  });
}

export function muxSoftSubtitles(videoPath, srtPath, outVideoPath) {
  const { ffmpegBin } = resolvePaths();

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', videoPath,
      '-i', srtPath,
      '-c', 'copy',
      '-c:s', 'mov_text',
      outVideoPath,
    ];

    const child = spawn(ffmpegBin, args);
    let errorOutput = '';

    child.stderr.on('data', data => {
      errorOutput += data.toString();
    });

    child.on('close', code => {
      if (code === 0 && fs.existsSync(outVideoPath)) {
        resolve(outVideoPath);
      } else {
        reject(new Error(`FFmpeg soft muxing failed (code ${code}): ${errorOutput.slice(-300)}`));
      }
    });

    child.on('error', err => reject(err));
  });
}
