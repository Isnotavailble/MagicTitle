# 🧙‍♂️ MagicTitle 
Generate subtitles for video with local whishper.cpp and AI translation (Google Gemini & Groq Cloud) with flawless Myanmar font shaping (Padauk + HarfBuzz). 


## 🌟 Overview

**MagicTitle** is a high-performance CLI application designed to break the language barrier.The idea is to turn any video into burmese subtitles. It combines local speech-to-text (**whisper.cpp**), advanced audio preprocessing (**FFmpeg**), intelligent translation (**Google Gemini** & **Groq Cloud**), and complex script font shaping (**HarfBuzz** + **Padauk**) into an elegant terminal interface built with **React** and **Ink**.

Whether you need quick English transcription, colloquial conversational Myanmar (Burmese) subtitles (စကားပြောစစ်စစ်), or burned-in subtitles with flawless Burmese rendering, MagicTitle automates the entire workflow in seconds.


## ✨ Key Features

### 🎙️ 1. Local AI Speech Transcription (Whisper.cpp)
- Powered by high-speed quantized `whisper.cpp` (`ggml-small-q5_1.bin` / `ggml-base.bin`).
- Runs **100% locally and privately** on your CPU using multi-threaded execution (`WHISPER_THREADS=6`).
- Automatic speech bandpass filtering (`80Hz - 7500Hz`) and dynamic audio normalization (`dynaudnorm`) via 16kHz mono PCM extraction.
- Automatic generation of timestamp-accurate `.srt` files.

### 🌐 2. Spoken Myanmar Unicode Translation (Gemini & Groq)
- **Natural Conversational Spoken Burmese (စကားပြောစစ်စစ်)**: Specially engineered film subtitle system prompts that avoid stiff bookish grammar (replaces formal endings like *သည်, ၏, ၌, ပါသည်* with natural conversational speech *တယ်, ပါ, ဖြစ်လို့လေ, ဗျာ*).
- **Dual AI Providers**:
  - **Google Gemini**: Uses `@google/genai` SDK and Generative Language API (`gemini-3.5-flash-lite`).
  - **Groq Cloud**: Ultra-fast inference with `qwen/qwen3.8-27b` via OpenAI-compatible endpoints.
- **Fault-Tolerant Batching**: Intelligent cue chunking (45 cues/batch) with index protection (`<index>|||<text>`), retry backoffs, and delimiter validation.
> Note : You have to get your own keys

### 🎨 3. Flawless Myanmar Font Shaping & Video Burn-in
- **Padauk & HarfBuzz Integration**: Solves standard FFmpeg Burmese rendering bugs (stacked consonants, medial consonants, diacritics / အက္ခရာဆင့်, ယပင့်, ရရွတ်, ဝဆွဲ, ဟထိုး) by dynamically converting SRT to Advanced SubStation Alpha (`.ass`) with `shaping=complex` and embedded `Padauk` font definitions.
- **Hard Burn Mode**: Permanently burns styled subtitles into video pixels (`libass`).
- **Soft Mux Mode**: Rapidly muxes selectable subtitle tracks (`mov_text`) into video containers without re-encoding.

### 🖥️ 4. Beautiful Interactive Terminal UI (Ink + React)
- **Interactive TUI**: Arrow-key navigation, real-time spinner status, and persistent execution log history.
- **⚡ Magic Mode**: One-click end-to-end automated pipeline with smart detection to reuse existing `.srt` files (saves 5–10 minutes).
- **🛠️ Manual Planner**: Fine-grained modular control to toggle individual steps (Extract Audio, Transcribe, Translate, Render).
- **📁 File Manager & Dashboard**: Scans directories, shows status badges (`[EN ✓]`, `[MY ✓]`, `[SUBTITLED]`), deletes stale subtitles, and features a built-in paginated **SRT Viewer**.
- **🔄 Instant Provider Switcher**: Toggle between Google Gemini and Groq on the fly.

---


## 📂 Project Structure

```
Subtitle Maker/
├── bin/
│   └── magictitle.js               # CLI executable entry point
├── fonts/
│   └── Padauk/                     # Padauk Unicode fonts for HarfBuzz shaping
│       ├── Padauk-Regular.ttf
│       ├── Padauk-Bold.ttf
│       └── OFL.txt
├── models/                         # Whisper GGML models
│   ├── ggml-small-q5_1.bin         # Default high-accuracy quantized model
│   ├── ggml-small.en.bin
│   ├── ggml-base.bin
│   └── ggml-tiny.en.bin
├── ffmpeg-8.1-essentials_build/    # Portable FFmpeg binaries
├── whisper-bin-x64/                # Portable whisper.cpp Windows binaries
├── src/
│   ├── index.js                    # Terminal bootstrap & banner renderer
│   ├── app.js                      # Main Ink application state & orchestrator
│   ├── config.js                   # Environment & runtime configuration
│   ├── core/
│   │   ├── ffmpeg.js               # Audio extraction, subtitle burning & muxing
│   │   ├── whisper.js              # whisper.cpp child process runner
│   │   ├── srt.js                  # SRT parser, stringifier & file I/O
│   │   ├── fontPatcher.js          # ASS script generator with Padauk styling
│   │   ├── fileScanner.js          # Video discovery & status badge detection
│   │   └── paths.js                # Binary & model resolver
│   ├── services/
│   │   ├── googleService.js        # Google Gemini AI translation integration
│   │   ├── groqService.js          # Groq Cloud AI translation integration
│   │   └── translator.js           # Batch translation orchestrator & retries
│   └── ui/
│       ├── Banner.js               # Branded ASCII banner & status bar
│       ├── MainMenu.js             # Root interactive navigation menu
│       ├── MagicModeView.js        # Quick-start automated workflow view
│       ├── ManualPlannerView.js    # Step-by-step modular pipeline planner
│       ├── FileManagerView.js      # Video manager & subtitle status dashboard
│       ├── SrtViewer.js            # Paginated terminal subtitle reader
│       ├── ProviderSelector.js     # AI translation provider switcher
│       ├── PipelineRunner.js       # Live execution spinner & next actions
│       ├── ProgressCard.js         # Real-time pipeline step monitor
│       └── ResultCard.js           # Completion summary & stats
├── testContents/                   # Working directory for media & subtitles
├── .env.example                    # Template environment variables
├── magictitle.bat                  # Windows batch launcher
├── package.json                    # Node.js dependencies & scripts
└── README.md                       # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **Operating System**: Windows 10/11 (x64) or Linux/macOS with FFmpeg & whisper.cpp installed

### 1. Installation
Clone or navigate to the repository directory and install Node.js dependencies:

```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

```env
# Google Gemini Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite

# Groq Configuration
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=qwen/qwen3.8-27b

# Defaults
DEFAULT_TRANSLATION_SERVICE=google
WHISPER_THREADS=6
```

> 💡 **Tip:** You can obtain a free Google Gemini API key from [Google AI Studio](https://aistudio.google.com/) and a Groq API key from [Groq Console](https://console.groq.com/).


## 🎮 Usage

### Launching the Application

You can launch MagicTitle using any of the following methods:

```bash
# Using npm start
npm start

# Using node directly
node src/index.js

# On Windows via batch runner
magictitle.bat
```

### Navigation & Modes

1. **⚡ Magic Mode**:
   - Pick your video file from `testContents/`.
   - Select either **Quick English Subtitles** or **Burmese Subtitles**.
   - If an `.srt` already exists, choose whether to **reuse** it (instant) or re-transcribe.
   - Choose output mode: **🔥 Hard Burn** (permanent) or **⚡ Soft Mux** (fast).
2. **📁 File Manager**:
   - Inspect all videos in `testContents/`.
   - View badges: `[EN ✓]`, `[MY ✓]`, `[SUBTITLED]`.
   - Preview cues with the built-in paginated **SRT Viewer**.
   - Clean up or delete generated subtitles.
3. **🛠️ Manual Planner**:
   - Check/uncheck individual stages:
     - `[✓] Extract 16kHz Audio (FFmpeg bandpass + dynaudnorm)`
     - `[✓] Transcribe Audio (whisper.cpp ggml-small-q5_1)`
     - `[✓] Translate to Myanmar Unicode (AI Cloud SDK)`
     - `[✓] Render Video with Subtitles (Hard Burn / Soft Mux)`
4. **🌐 Switch AI Provider**:
   - Quickly switch active LLM provider between **Google Gemini** and **Groq Cloud**.



## ⚙️ Configuration Options

| Option | Environment Variable | Default | Description |
| :--- | :--- | :--- | :--- |
| **Gemini API Key** | `GEMINI_API_KEY` | `""` | Google AI Studio API key |
| **Gemini Model** | `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Gemini model ID for translation |
| **Groq API Key** | `GROQ_API_KEY` | `""` | Groq Cloud API key |
| **Groq Model** | `GROQ_MODEL` | `qwen/qwen3.8-27b` | Groq model ID for translation |
| **Default Service**| `DEFAULT_TRANSLATION_SERVICE` | `google` | Default provider (`google` or `groq`) |
| **Whisper Threads**| `WHISPER_THREADS` | `6` | CPU threads allocated to whisper.cpp |

---

## 🛠️ Tech Stack & Dependencies

- **CLI Framework**: [Ink v8](https://github.com/vadimdemedes/ink) (React for interactive CLI), [Chalk](https://github.com/chalk/chalk), [Gradient String](https://github.com/bokub/gradient-string)
- **Speech-to-Text**: [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- **Audio & Video Engine**: [FFmpeg](https://ffmpeg.org/) (`libass`, `dynaudnorm`, `highpass`/`lowpass` filters)
- **AI / LLM Clients**:
  - [`@google/genai`](https://www.npmjs.com/package/@google/genai)
  - [`openai`](https://www.npmjs.com/package/openai) (for Groq Cloud)
- **Font & Shaping**: [Padauk](https://software.sil.org/padauk/) with HarfBuzz complex shaping



## 📄 License

This project has no explicit license.
