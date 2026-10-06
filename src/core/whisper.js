import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { resolvePaths } from './paths.js';
import { CONFIG } from '../config.js';

/**
 * Transcribes audio file using whisper-cli.
 * @param {string} wavPath - Path to 16kHz WAV file
 * @param {string} outputPrefix - Output prefix for generated .srt
 * @param {object|function} [optionsOrProgress] - Options object or onProgress callback
 * @param {string} [optionsOrProgress.language='en'] - 'en', 'auto', 'ja', etc.
 * @param {function} [onProgressCallback] - ({ cue }) => void
 * @returns {Promise<string>} Generated .srt path
 */
export function transcribeAudio(wavPath, outputPrefix, optionsOrProgress, onProgressCallback) {
  let options = {};
  let onProgress = onProgressCallback;

  if (typeof optionsOrProgress === 'function') {
    onProgress = optionsOrProgress;
  } else if (optionsOrProgress && typeof optionsOrProgress === 'object') {
    options = optionsOrProgress;
  }

  const { language = CONFIG.whisper?.language || 'en' } = options;
  const { whisperBin, modelFile } = resolvePaths(language);

  if (!whisperBin || !fs.existsSync(whisperBin)) {
    return Promise.reject(new Error('Whisper executable not found in whisper-bin-x64 directory.'));
  }
  if (!modelFile || !fs.existsSync(modelFile)) {
    return Promise.reject(new Error(`Whisper model not found at ${modelFile}`));
  }

  const expectedSrtPath = `${outputPrefix}.srt`;

  return new Promise((resolve, reject) => {
    const args = [
      '-m', modelFile,
      '-f', wavPath,
      '-t', String(CONFIG.whisper.threads || 6),
      '-bs', String(CONFIG.whisper.beamSize || 2),
      '-mc', String(CONFIG.whisper.maxContext || 128),
      '-sns',
      '-nth', String(CONFIG.whisper.noSpeechThreshold || 0.7),
      '-nf',
      '-l', language,
      '-osrt',
      '-of', outputPrefix,
    ];

    const child = spawn(whisperBin, args);
    let outputBuffer = '';

    child.stdout.on('data', data => {
      const str = data.toString();
      outputBuffer += str;
      const lines = str.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[') && trimmed.includes('-->')) {
          const textPart = trimmed.replace(/^\[.*?-->.*?\]\s*/, '').trim();
          const isMusicOrSymbolOnly = /^[\s♪♫🎵#\*\-\.\,\!\?_~]+$/i.test(textPart) ||
            /^(\[|\()?(\s*music\s*|\s*applause\s*|\s*singing\s*|\s*laughter\s*)(\]|\))?$/i.test(textPart);
          if (!isMusicOrSymbolOnly) {
            const cleanText = textPart.replace(/^[♪♫🎵\s]+|[♪♫🎵\s]+$/g, '').trim();
            if (cleanText) {
              const timestampPart = trimmed.match(/^\[.*?-->.*?\]/)?.[0] || '';
              if (onProgress) onProgress({ cue: `${timestampPart}   ${cleanText}` });
            }
          }
        }
      }
    });

    child.stderr.on('data', data => {
      outputBuffer += data.toString();
    });

    child.on('close', code => {
      if (code === 0 && fs.existsSync(expectedSrtPath)) {
        resolve(expectedSrtPath);
      } else if (fs.existsSync(expectedSrtPath)) {
        resolve(expectedSrtPath);
      } else {
        // Extract real error message from outputBuffer, ignoring the CLI usage manual
        const errorLines = outputBuffer
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l.startsWith('error:') || l.includes('failed to') || l.includes('miniaudio:'));

        let errorMsg = `Whisper transcription failed (exit code ${code}).`;
        if (errorLines.length > 0) {
          errorMsg = `Whisper error: ${errorLines.join(' ')}`;
        }

        reject(new Error(errorMsg));
      }
    });

    child.on('error', err => reject(err));
  });
}
