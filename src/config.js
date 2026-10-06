import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');

// Load .env strictly from PROJECT_ROOT
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

export const CONFIG = {
  gemini: {
    apiKey: (process.env.GEMINI_API_KEY || '').trim(),
    model: (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim(),
    temperature: 0.2,
    maxTokens: 8192,
  },
  groq: {
    apiKey: (process.env.GROQ_API_KEY || '').trim(),
    model: (process.env.GROQ_MODEL || 'qwen/qwen3.8-27b').trim(),
    temperature: 0.1,
    maxTokens: 8192,
  },
  defaultService: process.env.DEFAULT_TRANSLATION_SERVICE || 'google',
  whisper: {
    threads: parseInt(process.env.WHISPER_THREADS || '6', 10),
    beamSize: 2,
    maxContext: 128,
    suppressNst: true,
    noSpeechThreshold: 0.70,
  },
  batchSize: 45, // Cues per LLM batch
};
