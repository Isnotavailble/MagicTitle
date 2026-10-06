import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { resolvePaths } from './paths.js';
import { CONFIG } from '../config.js';

export function transcribeAudio(wavPath, outputPrefix, onProgress) {
  const { whisperBin, modelFile } = resolvePaths();

  if (!whisperBin || !fs.existsSync(whisperBin)) {
    throw new Error('Whisper executable not found in whisper-bin-x64 directory.');
  }
  if (!modelFile || !fs.existsSync(modelFile)) {
    throw new Error(`Whisper model not found at ${modelFile}`);
  }

  const expectedSrtPath = `${outputPrefix}.srt`;

  return new Promise((resolve, reject) => {
    const args = [
      '-m', modelFile,
      '-f', wavPath,
      '-t', String(CONFIG.whisper.threads),
      '-bs', String(CONFIG.whisper.beamSize),
      '-mc', String(CONFIG.whisper.maxContext),
      '--suppress-nst',
      '-nth', String(CONFIG.whisper.noSpeechThreshold),
      '-osrt',
      '-of', outputPrefix,
    ];

    const child = spawn(whisperBin, args);
    let outputBuffer = '';
    let lastCue = '';

    child.stdout.on('data', data => {
      const str = data.toString();
      outputBuffer += str;
      const lines = str.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[') && trimmed.includes('-->')) {
          lastCue = trimmed;
          if (onProgress) onProgress({ cue: trimmed });
        }
      }
    });

    child.stderr.on('data', data => {
      outputBuffer += data.toString();
    });

    child.on('close', code => {
      if (code === 0 && fs.existsSync(expectedSrtPath)) {
        resolve(expectedSrtPath);
      } else {
        // Fallback: check if Whisper generated .srt with different casing or in dir
        if (fs.existsSync(expectedSrtPath)) {
          resolve(expectedSrtPath);
        } else {
          reject(new Error(`Whisper transcription failed (exit code ${code}). Output: ${outputBuffer.slice(-300)}`));
        }
      }
    });

    child.on('error', err => reject(err));
  });
}
