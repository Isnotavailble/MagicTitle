# Implementation Plan: Sentence Reconstruction & Gap Checking via Whisper JSON

## 1. Overview & Problem Statement

In the current subtitle automation pipeline:
- **Main Model:** `small-en` (optimized with custom audio filtering: bandpass 70–7500Hz, limiter, dynamic audio normalizer).
- **Metadata Probe Model:** `tiny-en` (vocal isolation with RNNoise `bd.rnnn` for vocabulary harvesting).
- **Whisper CLI Flags:** Current production profile relies on `-ml 42` (max length 42 chars), `-sow` (split on word), and `-osrt` (direct SRT output).

### The Trade-off & Issue
Because the main model enforces a 42-character line limit (`-ml 42`), sentences that exceed 42 characters are aggressively bisected at word boundaries. Whisper assigns timestamps to these split chunks based on internal token estimates, often producing near-zero durations on the first fragment.

#### Real Example Output:
```srt
15
00:01:37,680 --> 00:01:37,740
The creature that attacked me had one of

16
00:01:37,740 --> 00:01:40,680
those boxes you have.
```
- **Cue 15 Duration:** Only **60 ms** (0.06 seconds) for 40 characters.
- **Result:** The subtitle flashes on and off instantaneously, making it completely impossible for viewers to read before disappearing or transitioning to the next cue.

---

## 2. Solution Architecture

Rather than hard-coding a global replacement of `-osrt`, **JSON output will be configurable per model profile** in `src/config.js` (e.g. `useJsonOutput: true` for `small-en`, with configurable silence gap and timing thresholds).

When `useJsonOutput: true`:
1. `whisper-cli.exe` is invoked with `-oj` (generating `<outputPrefix>.json`).
2. A new dedicated module, **`srtNormalizer`** (`src/core/srtNormalizer.js`), processes the JSON segments using the installed **`compromise` NLP library** alongside millisecond offset gap checks.
3. The normalized output is formatted and saved as standard, clean `.srt` cues with enforced reading durations, feeding directly into the downstream Myanmar translation and FFmpeg video burning stages.

```
                    ┌──────────────────────────────────┐
                    │      16kHz Normalized Audio      │
                    └─────────────────┬────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────────┐
                    │     whisper-cli.exe              │
                    │  (Flags: -oj if useJsonOutput,   │
                    │   otherwise fallback to -osrt)   │
                    └─────────────────┬────────────────┘
                                      │
                  ┌───────────────────┴───────────────────┐
                  │ useJsonOutput: true                   │ useJsonOutput: false
                  ▼                                       ▼
        ┌───────────────────────────────┐       ┌───────────────────┐
        │       srtNormalizer           │       │ Legacy direct SRT │
        │  (src/core/srtNormalizer.js)  │       │     (-osrt)       │
        │ - compromise NLP parsing      │       └─────────┬─────────┘
        │ - Millisecond offset gap check│                 │
        │ - Complete sentence (. ! ?)   │                 │
        │ - Minimum duration clamping   │                 │
        └───────────────┬───────────────┘                 │
                        │                                 │
                        ▼                                 │
        ┌───────────────────────────────┐                 │
        │   Clean Normalized .srt File  │ ◄───────────────┘
        │  (2-line wrapping > 42 chars) │
        └───────┬───────────────┬───────┘
                │               │
                ▼               ▼
  ┌─────────────────────┐ ┌─────────────────────┐
  │ Myanmar Translation │ │ FFmpeg Video Burner │
  │ (Google / Groq LLM) │ │  (Hard / Soft Mux)  │
  └─────────────────────┘ └─────────────────────┘
```

---

## 3. Model Profile Configuration (`src/config.js`)

In `MODEL_PROFILES`, each model profile can configure its output format and timing thresholds independently:

```javascript
'small-en': {
  id: 'small-en',
  displayName: 'Small Model (English)',
  fileName: 'ggml-small.en.bin',
  threads: parseInt(process.env.WHISPER_THREADS || '8', 10),
  beamSize: 5,
  bestOf: 5,
  flashAttention: false,
  noFallback: false,
  splitOnWord: true,
  wordTimestamps: 0.01,
  maxLen: 42,
  maxContext: 224,
  noSpeechThreshold: 0.60,
  entropyThold: 2.4,
  noiseModelUsed: false,
  audioFilter: 'highpass=f=70,lowpass=f=7500,alimiter=limit=-3dB:attack=5:release=50:asc=1,dynaudnorm=f=70:g=5:m=3:p=0.95:b=1:s=0',

  // --- NEW: JSON Normalization Profile Settings ---
  useJsonOutput: true,       // When true, uses -oj and passes through srtNormalizer
  maxSilenceGapMs: 750,      // Max silence gap (ms) to merge sentence fragments
  minCueDurationMs: 1200,    // Minimum on-screen cue display duration (eliminates 60ms flashes)
  maxCueDurationMs: 7000,    // Hard upper bound to prevent runaway cues in continuous speech
  maxCharsPerLine: 42,       // Target line wrapping threshold for final subtitles
  
  description: 'Clean speech bandpass (66-7500Hz) with controlled leveling & 3.5kHz EQ (~487MB)',
},
```

---

## 4. Whisper JSON Schema (`-oj`)

When `-oj` is passed, `whisper-cli.exe` writes:

```json
{
  "systeminfo": "...",
  "model": { "type": "small", "multilingual": false },
  "params": { "model": "models/ggml-small.en.bin", "language": "en" },
  "result": { "language": "en" },
  "transcription": [
    {
      "timestamps": { "from": "00:01:37,680", "to": "00:01:37,740" },
      "offsets": { "from": 97680, "to": 97740 },
      "text": " The creature that attacked me had one of"
    },
    {
      "timestamps": { "from": "00:01:37,740", "to": "00:01:40,680" },
      "offsets": { "from": 97740, "to": 100680 },
      "text": " those boxes you have."
    }
  ]
}
```

* **Advantage:** `offsets.from` and `offsets.to` provide exact integer millisecond timestamps directly from Whisper, eliminating regex parsing and string math.

---

## 5. `srtNormalizer` Logic & Compromise NLP Integration

The `srtNormalizer` module (`src/core/srtNormalizer.js`) implements sentence reconstruction and timing normalization.

### A. NLP-Powered Sentence Boundary Detection (`compromise`)
Instead of relying on fragile manual regular expressions for abbreviation filtering, `srtNormalizer` leverages the installed **`compromise`** NLP library (`compromise: ^14.18.0`):
- `import nlp from 'compromise';`
- `compromise` natively recognizes English abbreviations (`Mr.`, `Mrs.`, `Dr.`, `vs.`, `U.S.`, `etc.`, `St.`, `approx.`, decimals) and avoids treating them as sentence boundaries.
- When checking if the accumulated buffer forms a complete sentence:
  ```javascript
  const doc = nlp(bufferedText.trim());
  const sentences = doc.sentences().out('array');
  ```
  If `compromise` determines that the current buffer contains complete sentences, or if the text strictly ends with terminal punctuation (`.`, `!`, `?`, `."`, `!"`, `?'`), the boundary is confirmed.

### B. Timestamp & Gap Analysis
Between the current cue buffer and the upcoming segment (`next`):
1. **Silence Gap Calculation:**
   $$\text{gap} = \text{next.offsets.from} - \text{curr.offsets.to}$$
2. **Merge Conditions:**
   - The current buffer does **not** end with a complete sentence terminal (`.`, `!`, `?`), AND
   - $\text{gap} \le \text{maxSilenceGapMs}$ (e.g. 750ms), AND
   - `next.text` does not start with a dialogue speaker dash (`- `), AND
   - The combined duration $(\text{next.offsets.to} - \text{curr.offsets.from}) \le \text{maxCueDurationMs}$ (e.g. 7,000ms).
   - $\rightarrow$ **Action:** Merge `next.text` into the current buffer and extend the end offset: `curr.offsets.to = next.offsets.to`.
3. **Split Conditions:**
   - If $\text{gap} > \text{maxSilenceGapMs}$, flush the current cue even if punctuation was missing (speaker made a long pause; subtitle should not hang during extended silence).

### C. Duration & Readability Guards
1. **Minimum Display Duration:**
   $$\text{cue.end} = \max(\text{cue.end}, \text{cue.start} + \text{minCueDurationMs})$$
   Guarantees that no subtitle ever renders for only 60ms.
2. **Word-Adaptive Duration:**
   $$\text{targetDuration} = \max(\text{minCueDurationMs}, \text{wordCount} \times 350\text{ms})$$
3. **Non-Overlapping Clamping:** If extending the duration overlaps with the start of the following cue, clamp:
   $$\text{curr.end} = \max(\text{curr.start} + 800\text{ms}, \text{next.start} - 50\text{ms})$$

### D. Smart Line Wrapping
When a merged full sentence exceeds `maxCharsPerLine` (42 chars):
- Rather than cutting the cue across time, split into **2 visually balanced lines** using `\n` at the most natural central word boundary.

---

## 6. Proposed File Modifications

### 1. `src/config.js`
- Add profile-level configuration to `MODEL_PROFILES['small-en']` (and other profiles as needed):
  - `useJsonOutput: true`
  - `maxSilenceGapMs: 750`
  - `minCueDurationMs: 1200`
  - `maxCueDurationMs: 7000`
  - `maxCharsPerLine: 42`

### 2. `src/core/whisper.js`
- Inspect `activeModel.useJsonOutput`:
  - If `true`: pass `-oj` instead of `-osrt`, expect `${outputPrefix}.json`.
  - If `false` / undefined: retain current `-osrt`, expect `${outputPrefix}.srt`.
- Return metadata or file path indicating the output type.

### 3. `src/core/srtNormalizer.js` *(New File)*
- Core implementation importing `compromise`:
  - `export function normalizeTranscriptionJson(jsonData, options = {})`
  - `export function normalizeSrtFromJson(jsonFilePath, outSrtPath, options = {})`
  - Exports functions for NLP boundary checks, gap merging, duration clamping, and line balancing.

### 4. `src/app.js`
- In Step 2 (Whisper Transcription):
  - If `activeModel.useJsonOutput` is active:
    - Pass `${safeTempWhisperPrefix}` for JSON output.
    - Run `normalizeSrtFromJson` from `srtNormalizer` to produce `enSrt`.
    - Clean up temporary JSON artifacts.
  - If `useJsonOutput` is false:
    - Fallback to current `sanitizeSrtEntries(readSrtFile(...))`.
- Downstream steps (`translateSrtFile`, `burnEnglishSubtitles`, `burnMyanmarSubtitles`) operate seamlessly without breaking changes.

---

## 7. Verification & Test Cases

| Test Case | Scenario / Input | Expected Result |
| :--- | :--- | :--- |
| **Bisection (< 42 chars)** | `[00:01:37.680 -> 00:01:37.740] The creature that attacked me had one of`<br>`[00:01:37.740 -> 00:01:40.680] those boxes you have.` | Merged to single cue: `[00:01:37.680 -> 00:01:40.680]` (Duration: 3,000ms), 2 balanced lines. |
| **Compromise NLP Abbreviations** | `Dr. Watson arrived at 3.5 Baker St.` | `compromise` prevents premature sentence breaks on `Dr.` and `St.`, correctly recognizing the full sentence. |
| **Silence Gap Pause** | Segment 1 ends without period, but next segment starts 2.0s later. | Not merged across silence; Cue 1 ends with clamped duration; Cue 2 begins cleanly after pause. |
| **Dialogue Speaker Turns** | `[00:00:00 -> 00:00:02] - Why?`<br>`[00:00:02 -> 00:00:04] - Because I said so.` | Preserved as separate dialogue turns without unwanted concatenation. |
| **Backward Compatibility** | Model profile with `useJsonOutput: false` | Uses legacy `-osrt` pathway without error. |
