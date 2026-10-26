import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');

// Load .env strictly from PROJECT_ROOT
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

export const MODEL_PROFILES = {
  'groq-cloud-turbo': {
    id: 'groq-cloud-turbo',
    displayName: 'Groq Cloud (Whisper Large v3 Turbo)',
    isCloud: true,
    modelName: 'whisper-large-v3-turbo',
    temperature: 0.2,

    audioFilter: 'agate=threshold=0.03:attack=20:release=250',

    maxChunkSizeBytes: 19 * 1024 * 1024, // 19 MB strict ceiling
    chunkDurationSec: 500, // 500s (~16 MB per chunk)
    interChunkDelayMs: 600, // Polite pause between chunks to respect 20 RPM
    maxRetries: 3,
    useJsonOutput: true,

    maxSilenceGapMs: 500,
    minCueDurationMs: 1200,
    maxCueDurationMs: 7000,
    maxCharsPerLine: 42,
    
	description: 'Ultra-fast Groq Cloud API with large-v3-turbo, battle-tested audio leveling & full-sentence normalizer',
  },
  'large-turbo-q5': {
    id: 'large-turbo-q5',
    displayName: 'Large v3 Turbo (Q5_0)',
    fileName: 'ggml-large-v3-turbo-q5_0.bin',
    threads: parseInt(process.env.WHISPER_TURBO_THREADS || '6', 10), // Full 12-thread CPU throughput
    beamSize: 1, // Fast greedy search
    bestOf: 1,   // Single candidate evaluation
    flashAttention: true, // Optimized Flash Attention
    noFallback: false, // Enables temperature fallback to break out of hallucination loops
    splitOnWord: true, // Snaps cue boundaries to word ends
    wordTimestamps: 0.05, // Tight millisecond token timestamps
    maxContext: 128, // Preserves sentence continuity
    noSpeechThreshold: 0.65, // Rejects punch/impact non-speech sounds
    entropyThold: 2.4, // Standard threshold to abort repetition loops
    noiseModelUsed: false,
    audioFilter: 'highpass=f=66,lowpass=f=7500,equalizer=f=3500:t=q:w=1.5:g=3',
    description: 'Deep neural precision (32 layers) with 66Hz low-end & anti-hallucination (~547MB)',
  },
  'tiny-en': {
    id: 'tiny-en',
    displayName: 'Tiny English Probe (Metadata Extractor)',
    fileName: 'ggml-tiny.en.bin',
    threads: parseInt(process.env.WHISPER_THREADS || '6', 10),
    beamSize: 5, // Ultra-fast greedy search
    bestOf: 5,
    flashAttention: false,
    noFallback: false, // Fast single-pass
    splitOnWord: true, // Decoupled timing
    maxContext: 224,
    noSpeechThreshold: 0.60,
    entropyThold: 2.4,
    noiseModelUsed: true, // Uses models/bd.rnnn for vocal isolation
    audioFilter: 'highpass=f=70,lowpass=f=7500,alimiter=limit=-3dB:attack=5:release=50:asc=1,dynaudnorm=f=70:g=5:m=3:p=0.95:b=1:s=0',
    description: 'Ultra-fast vocabulary harvester probe with RNNoise vocal isolation (~77MB)',
  },

  'small-en': {
    id: 'small-en',
    displayName: 'Small Model (English)',
    fileName: 'ggml-small.en.bin',
    threads: parseInt(process.env.WHISPER_THREADS || '8', 10),
    beamSize: 5,
    bestOf: 5,
    flashAttention: false,
    noFallback: false, // Disables temperature retry loops
    splitOnWord: true, // Splits cue boundaries on exact words (-sow)
    wordTimestamps: 0.01,
	maxLen : 42,
    maxContext: 224, // Prevents autoregressive repetition loops
    noSpeechThreshold: 0.60,
    entropyThold: 2.4,
    noiseModelUsed: false,
    useJsonOutput: true,
    maxSilenceGapMs: 750,
    minCueDurationMs: 1200,
    maxCueDurationMs: 7000,
    maxCharsPerLine: 42,
	//highpass=f=66,lowpass=f=7500,alimiter=limit=-3dB:attack=5:release=50:asc=1,dynaudnorm=f=120:g=5:m=3:p=0.95:b=1,equalizer=f=3500:t=q:w=1.5:g=3
    audioFilter: 'highpass=f=70,lowpass=f=7500,alimiter=limit=-3dB:attack=5:release=50:asc=1,dynaudnorm=f=70:g=5:m=3:p=0.95:b=1:s=0',
    description: 'Clean speech bandpass (66-7500Hz) with controlled leveling & 3.5kHz EQ (~487MB)',
  },

  'small-en-universal': {
    id: 'small-en-universal',
    displayName: 'Small Model Universal',
    fileName: 'ggml-small.en.bin',
    threads: parseInt(process.env.WHISPER_THREADS || '6', 10),
    beamSize: 5,
    bestOf: 5,
    flashAttention: false,
    noFallback: false,
    splitOnWord: true,
    wordTimestamps: 0.05,
    maxContext: 128,
    noSpeechThreshold: 0.60,
    entropyThold: 2.8,
    noiseModelUsed: false,
    audioFilter: 'highpass=f=66,lowpass=f=7500,equalizer=f=3500:t=q:w=1.5:g=3',
    description: 'Clean speech bandpass (66-7500Hz) with 3.5kHz friction presence EQ (~487MB)',
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
	//maxLen: 42 , // Keeps line lengths natural and synchronized (-ml 42)
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
  cloudWhisper: {
    model: 'whisper-large-v3-turbo',
    maxChunkSizeBytes: 19 * 1024 * 1024,
    chunkDurationSec: 500,
    interChunkDelayMs: 600,
    maxRetries: 3,
  },
  whisper: {
    threads: parseInt(process.env.WHISPER_THREADS || '6', 10),
    beamSize: 2,
    maxContext: 128,
    suppressNst: true,
    noSpeechThreshold: 0.70,
  },
  batchSize: 45, // Cues per LLM batch
};

