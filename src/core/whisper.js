import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { resolvePaths } from './paths.js';
import { isModelActive, getActiveModel } from './modelManager.js';
import { PROJECT_ROOT } from '../config.js';

/**
 * Transcribes audio file directly using whisper-cli.exe with active model parameters.
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

  const { language = 'en', prompt = null } = options;

  let activeModel = options.modelProfile;
  if (!activeModel) {
    if (!isModelActive()) {
      return Promise.reject(new Error('No Whisper model is currently active. Please select an active model from the Model Manager first.'));
    }
    activeModel = getActiveModel();
  } else if (!activeModel.fullPath) {
    const modelsDir = path.join(PROJECT_ROOT, 'models');
    activeModel = {
      ...activeModel,
      fullPath: path.join(modelsDir, activeModel.fileName),
    };
  }

  const { whisperBin, vadModelFile } = resolvePaths(language);

  if (!whisperBin || !fs.existsSync(whisperBin)) {
    return Promise.reject(new Error('whisper-cli.exe binary was not found in whisper-bin-x64 directory.'));
  }

  if (!activeModel || !fs.existsSync(activeModel.fullPath)) {
    return Promise.reject(new Error(`Active model file not found at ${activeModel?.fullPath}`));
  }

  const useJson = Boolean(activeModel?.useJsonOutput);
  const expectedOutputPath = useJson ? `${outputPrefix}.json` : `${outputPrefix}.srt`;

  return new Promise((resolve, reject) => {
    const args = [
      '-m', activeModel.fullPath,
      '-f', wavPath,
      '-t', String(activeModel.threads ?? 6),
      '-bs', String(activeModel.beamSize ?? 1),
      ...(activeModel.bestOf !== undefined ? ['-bo', String(activeModel.bestOf)] : []),
      '-mc', String(activeModel.maxContext ?? 128),
      '-sns',
      '-nth', String(activeModel.noSpeechThreshold ?? 0.70),
      ...(activeModel.splitOnWord ? ['-sow'] : []),
      ...(activeModel.maxLen ? ['-ml', String(activeModel.maxLen)] : []),
      ...(activeModel.wordTimestamps !== undefined ? ['-wt', String(activeModel.wordTimestamps)] : []),
      ...(activeModel.flashAttention ? ['-fa'] : ['-nfa']),
      ...(activeModel.noFallback ? ['-nf'] : []),
      ...(activeModel.vad && vadModelFile && fs.existsSync(vadModelFile) ? [
        '--vad',
        '-vm', vadModelFile,
        ...(activeModel.vadThreshold !== undefined ? ['-vt', String(activeModel.vadThreshold)] : []),
        ...(activeModel.vadSpeechPadMs !== undefined ? ['-vp', String(activeModel.vadSpeechPadMs)] : []),
        ...(activeModel.vadMinSpeechDurationMs !== undefined ? ['-vspd', String(activeModel.vadMinSpeechDurationMs)] : []),
      ] : []),
      ...(activeModel.entropyThold !== undefined ? ['--entropy-thold', String(activeModel.entropyThold)] : []),
      ...(prompt ? ['--prompt', prompt] : []),
      '-l', language,
      ...(useJson ? ['-oj'] : ['-osrt']),
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
      if (code === 0 && fs.existsSync(expectedOutputPath)) {
        resolve(expectedOutputPath);
      } else if (fs.existsSync(expectedOutputPath)) {
        resolve(expectedOutputPath);
      } else {
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

    child.on('error', err => reject(new Error(`Failed to spawn whisper-cli.exe: ${err.message}`)));
  });
}
