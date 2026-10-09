# Agent Instructions & Pipeline Architecture Reference (AGENT.md)

## Core Mission & Architecture Overview
This document defines the strict constraints, model properties, battle-tested audio configurations, and verified operational rules for the MagicTitle local subtitle automation pipeline.

---

## 1. Verified Model Discovery & Prompt Hypothesis

### The Initial Silence / Music Trap
- **Finding**: When a video begins with non-speech (e.g. 0 to 5 seconds of background music/silence), injecting a dynamic prompt formatted as prose (e.g., `"The following dialogue features Rosetta Stone, Batman..."`) causes Whisper's autoregressive text decoder to unground from acoustic frames.
- **Consequence**: Whisper holds open the first speech segment across the entire musical intro and the first speaker turn, resulting in a single run-on block (e.g. `[00:00:00.000 --> 00:00:17.000]`).
- **Contrast**: 
  - In videos where speech begins immediately at `00:00:00`, the prompt anchors immediately to vocal frames, yielding both correct vocabulary and normal sentence boundaries.
  - Without a prompt, Whisper naturally isolates initial music as `[00:00:00 --> 00:00:04.920] ♪♪♪` and begins the dialogue precisely at `[00:00:04.920 --> 00:00:08.760]`.

### The Prompt Formatting Rules
1. **Never use raw comma-separated lists (`Word1, Word2, Word3`)**:
   - Whisper mimics the punctuation style of the prompt. Comma lists cause "Excel style" output where Whisper places commas after every 2–3 words across the entire subtitle.
2. **Never truncate prompt sentences with ellipses (`...`)**:
   - Incomplete thoughts cause Whisper's decoder to anticipate continuation across incoming audio.
3. **Allow clean unconditioned transcription**:
   - The user must always have the option to skip the prompt entirely (`usePrompt: false`) to guarantee unconditioned, millisecond-accurate sentence cuts.

---

## 2. Hard Architectural Constraints (STRICTLY ENFORCED)

### A. Banned Components on Main Model
- **BANNED**: **Silero VAD (`--vad`)** on the main model.
  - VAD lumps entire conversational turns into coarse speech windows (e.g. 17-second blocks) until long silences occur. Do not enable VAD on the main transcription profile.
- **BANNED**: **Neural RNN Noise Model (`arnndn` / `bd.rnnn`)** on the main model (`noiseModelUsed: false`).
  - Neural denoising strips speech harmonics and degrades Whisper's vocabulary and timestamp precision in dialogue scenes with background score. Keep it restricted only to the fast probe pass if needed.
- **BANNED**: **Arbitrary character-based string truncation** in JavaScript post-processing (e.g. chopping strings mid-word). Subtitle splits must only occur between whole words.

### B. The Battle-Tested Audio Filter (NEVER ALTER OR REMOVE)
The following FFmpeg audio filter is strictly preserved for `small-en`:
```
highpass=f=70,lowpass=f=7500,alimiter=limit=-3dB:attack=5:release=50:asc=1,dynaudnorm=f=70:g=5:m=3:p=0.95:b=1:s=0
```
- **Rationale**: This filter consistently outperforms all neural models in heavy fight scenes and loud musical backdrops. It attenuates rumble (<70Hz) and high-frequency noise (>7500Hz), limits sudden loud spikes to -3dB, and applies dynamic audio normalization with a 70-frame filter window for vocal clarity.

---

## 3. Main Model Profile Specifications (`small-en`)

The canonical configuration in `src/config.js` for `small-en`:

| Property | Value | Rationale |
| :--- | :--- | :--- |
| **Model File** | `ggml-small.en.bin` | English-optimized small model (~487MB) |
| **Threads (`-t`)** | `8` | Optimal CPU multi-threading throughput |
| **Beam Search (`-bs`)** | `5` | High-accuracy beam search |
| **Best Of (`-bo`)** | `5` | 5-candidate evaluation |
| **Max Context (`-mc`)** | `224` | Context window for sentence continuity |
| **Max Length (`-ml`)** | `42` | Generates balanced segments for the sentence normalizer |
| **Word Timestamps (`-wt`)** | `0.01` | Dynamic Time Warping (DTW) for millisecond alignment |
| **Split On Word (`-sow`)** | `true` | Snaps cue boundaries strictly to full word ends |
| **No Speech Threshold (`-nth`)** | `0.60` | Rejects non-speech sound effects |
| **Suppress Non-Speech (`-sns`)** | `true` | Suppresses non-speech token emissions |
| **Flash Attention** | `false` (`-nfa`) | Deterministic CPU compatibility |
| **No Fallback** | `false` | Standard temperature fallback |
| **Entropy Threshold** | `2.4` | Guards against repetition loops |
| **Audio Filter** | *Battle-tested filter above* | Crystal-clear dialogue leveling |
| **Output Engine** | Segment JSON (`-oj`) + Normalizer | Stitches segments into full sentences with compromise NLP |

---

## 4. Subtitle & Normalizer Integrity Rules

1. **Words Must Never Be Halved**:
   - Subwords and contractions (e.g. `"Don't"`) must always remain complete atomic words.
   - A subtitle cut can **only** occur between two whole words, never inside a word or contraction.
2. **Never Interfere with the Model's Timeline**:
   - Do not artificially inflate or stretch `endMs` into dead silence to meet an arbitrary duration target.
   - A subtitle cue must begin exactly when the first word is spoken and disappear when the last word finishes.
3. **Punctuation Filtering Guard**:
   - Terminal punctuation (`.`, `!`, `?`) and commas (`,`) must never be stripped or treated as noise symbols in token sanitizers.
4. **Silence Gap Driven Sentence Boundaries**:
   - A period alone does not split an utterance if the silence gap between words is negligible (< 350ms, e.g. rapid speech like `"No. No"`).
   - A sentence cut occurs when terminal punctuation (`.`, `!`, `?`) coincides with an acoustic silence gap before the next spoken word.
