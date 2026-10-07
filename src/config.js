import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');

// Load .env strictly from PROJECT_ROOT
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

export const MODEL_PROFILES = {
  'large-turbo-q5': {
    id: 'large-turbo-q5',
    displayName: 'Large v3 Turbo (Q5_0)',
    fileName: 'ggml-large-v3-turbo-q5_0.bin',
    threads: parseInt(process.env.WHISPER_TURBO_THREADS || '12', 10), // Full 12-thread CPU throughput
    beamSize: 1, // Fast greedy search
    bestOf: 1,   // Single candidate evaluation
    flashAttention: true, // Optimized Flash Attention
    noFallback: true, // Disables temperature fallback loops
    maxContext: 128,
    noSpeechThreshold: 0.70,
    audioFilter: 'highpass=f=80,lowpass=f=7500',
    description: 'Deep neural precision, zero hallucinations (Q5_0 ~547MB)',
  },

  'small-en': {
    id: 'small-en',
    displayName: 'Small Model (English)',
    fileName: 'ggml-small.en.bin',
    threads: parseInt(process.env.WHISPER_THREADS || '6', 10),
    beamSize: 5,
    bestOf: 5,
    flashAttention: false,
    noFallback: true, // Disables temperature retry loops
    splitOnWord: false, // Splits cue boundaries on exact words (-sow)
	//maxLen: 48 , // Keeps line lengths natural and synchronized (-ml 42)
    wordTimestamps: 0.01, // Exact millisecond token probability threshold (-wt 0.01)
    vad: false, // Enable Silero VAD voice activity detection
    vadThreshold: 0.50, // Sensitive speech threshold
    vadSpeechPadMs: 40, // Tight 40ms speech padding so subtitles don't start early
    vadMinSpeechDurationMs: 120, // Captures short 1-syllable vocalizations
    maxContext: 128, // Prevents autoregressive repetition loops
    noSpeechThreshold: 0.70,
    audioFilter: 'highpass=f=55,lowpass=f=7500', // Clean speech bandpass without dynaudnorm noise boosting
    description: 'Fast 1-second English speech recognition (~487MB)',
  },
  'small-en-reel' : {
	id: 'small-en-reel',
    displayName: 'Small Model Reels (English)',
    fileName: 'ggml-small.en.bin',
    threads: parseInt(process.env.WHISPER_THREADS || '6', 10),
    beamSize: 5,
    bestOf: 5,
    flashAttention: false,
    noFallback: true, // Disables temperature retry loops
    splitOnWord: true, // Splits cue boundaries on exact words (-sow)
	maxLen: 42 , // Keeps line lengths natural and synchronized (-ml 42)
    wordTimestamps: 0.01, // Exact millisecond token probability threshold (-wt 0.01)
    vad: false, // Enable Silero VAD voice activity detection
    vadThreshold: 0.46, // Sensitive speech threshold
    vadSpeechPadMs: 30, // Tight 40ms speech padding so subtitles don't start early
    vadMinSpeechDurationMs: 150, // Captures short 1-syllable vocalizations
    maxContext: 128, // Prevents autoregressive repetition loops
    noSpeechThreshold: 0.70,
    audioFilter: 'highpass=f=80,lowpass=f=7500 ,dynaudnorm', // Clean speech bandpass without dynaudnorm noise boosting
    description: 'Fast 1-second English speech recognition (~487MB)',
  },
  'small-q5': {
    id: 'small-q5',
    displayName: 'Small Multilingual (Q5_1)',
    fileName: 'ggml-small-q5_1.bin',
    threads: parseInt(process.env.WHISPER_THREADS || '6', 10),
    beamSize: 5,
    bestOf: 5,
    flashAttention: false,
    noFallback: false, // Disables temperature retry loops
    splitOnWord: false, // Splits cue boundaries on exact words (-sow)
    //maxLen: , // Keeps line lengths natural and synchronized (-ml 42)
    wordTimestamps: 0.01, // Exact millisecond token probability threshold (-wt 0.01)
    vad: true, // Enable Silero VAD voice activity detection
    vadThreshold: 0.15, // Sensitive speech threshold
    vadSpeechPadMs: 30, // Tight 40ms speech padding so subtitles don't start early
    vadMinSpeechDurationMs: 50, // Captures short 1-syllable vocalizations
    maxContext: 128, // Prevents autoregressive repetition loops
    noSpeechThreshold: 0.70,
    audioFilter: 'highpass=f=80,lowpass=f=7500', // Clean speech bandpass without dynaudnorm noise boosting
    description: 'Multilingual speech recognition with precision millisecond alignment (~190MB)',
  },
  'base': {
    id: 'base',
    displayName: 'Base Multilingual',
    fileName: 'ggml-base.bin',
    threads: parseInt(process.env.WHISPER_THREADS || '6', 10),
    beamSize: 2,
    bestOf: 2,
    flashAttention: false,
    noFallback: false,
    maxContext: 128,
    noSpeechThreshold: 0.70,
    audioFilter: 'highpass=f=80,lowpass=f=7500,dynaudnorm',
    description: 'Ultra-lightweight fallback model (~148MB)',
  },
};

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

