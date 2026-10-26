import React, { useState } from 'react';
import { Box, Text, Static } from 'ink';
import path from 'path';
import fs from 'fs';

import { StatusBar } from './ui/Banner.js';
import { MainMenu } from './ui/MainMenu.js';
import { ProviderSelector } from './ui/ProviderSelector.js';
import { FileManagerView } from './ui/FileManagerView.js';
import { MagicModeView } from './ui/MagicModeView.js';
import { ManualPlannerView } from './ui/ManualPlannerView.js';
import { SrtViewer } from './ui/SrtViewer.js';
import { PipelineRunner } from './ui/PipelineRunner.js';
import { ModelManagerView } from './ui/ModelManagerView.js';

import { extractAudio, burnEnglishSubtitles, burnMyanmarSubtitles, muxSoftSubtitles } from './core/ffmpeg.js';
import { transcribeAudio } from './core/whisper.js';
import { transcribeAudioGroqCloud } from './services/groqWhisperService.js';
import { runMetadataProbe } from './core/probeManager.js';
import { translateSrtFile } from './services/translator.js';
import { readSrtFile, writeSrtFile, sanitizeSrtEntries } from './core/srt.js';
import { normalizeSrtFromJson } from './core/srtNormalizer.js';
import { generateSafeHash, resolvePaths } from './core/paths.js';
import { isModelActive, getActiveModel } from './core/modelManager.js';
import { CONFIG, MODEL_PROFILES } from './config.js';

let logIdCounter = 0;

export function App() {
  const [screen, setScreen] = useState('menu');
  const [currentProvider, setCurrentProvider] = useState(CONFIG.defaultService || 'google');
  const [selectedVideoEntry, setSelectedVideoEntry] = useState(null);
  const [activeSrtPath, setActiveSrtPath] = useState(null);

  // Ink Static items: Printed permanently to terminal stdout once, never redrawn!
  const [staticItems, setStaticItems] = useState([]);

  // Live dynamic running state (only 1-2 lines in viewport!)
  const [runningState, setRunningState] = useState(null);

  const h = React.createElement;

  const pushStatic = (item) => {
    setStaticItems(prev => [...prev, item]);
  };

  const addStaticLog = (msg) => {
    pushStatic({ id: `log_${++logIdCounter}`, type: 'log', text: msg });
  };

  // Run the pipeline job (GitHub Actions chronological order: Step Header -> Logs -> Complete)
  const startJob = async (jobConfig) => {
    const { video, workflow, reuseSrt, reuseMySrt, burnMode, manualPlan, language = 'en' } = jobConfig;
    const isMyanmar = workflow === 'myanmar';
    const totalStartTime = Date.now();

    // Determine required steps
    const shouldProbe = manualPlan ? Boolean(manualPlan.extractMetadata) : (jobConfig.useProbe !== undefined ? Boolean(jobConfig.useProbe) : false);
    const shouldExtract = manualPlan ? manualPlan.extractAudio : (!reuseSrt && !reuseMySrt);
    const shouldTranscribe = manualPlan ? manualPlan.transcribe : (!reuseSrt && !reuseMySrt);
    const shouldTranslate = manualPlan ? manualPlan.translate : (isMyanmar && !reuseMySrt);
    const shouldRender = manualPlan ? manualPlan.renderVideo : true;

    // Guard: ensure a model is active in state if transcription is required
    if (shouldTranscribe && !isModelActive()) {
      setScreen('modelManagerRequired');
      return;
    }

    const activeModel = getActiveModel();
    const isCloud = Boolean(activeModel?.isCloud);
    const modelName = activeModel?.displayName || 'Whisper';
    const isLargeTurbo = Boolean(activeModel?.id?.includes('turbo') || activeModel?.id?.includes('large'));

    const totalStepCount = (shouldProbe ? 1 : 0) + (shouldExtract ? 1 : 0) + (shouldTranscribe ? 1 : 0) + (shouldTranslate ? 1 : 0) + (shouldRender ? 1 : 0);
    let stepNum = 1;

    const stepDefs = {
      probe: shouldProbe ? {
        id: 'probe',
        title: `[${stepNum++}/${totalStepCount}] Extract Metadata Probe with tiny.en (RNNoise)`,
      } : null,
      extract: shouldExtract ? {
        id: 'extract',
        title: `[${stepNum++}/${totalStepCount}] Extract 16kHz Audio (FFmpeg bandpass${isLargeTurbo ? ' 80-7500Hz' : ' + dynaudnorm'})`,
      } : null,
      whisper: shouldTranscribe ? { id: 'whisper', title: `[${stepNum++}/${totalStepCount}] Speech-to-Text with Whisper (${modelName})` } : null,
      translate: shouldTranslate ? { id: 'translate', title: `[${stepNum++}/${totalStepCount}] Myanmar Translation (${currentProvider.toUpperCase()})` } : null,
      render: shouldRender ? {
        id: 'render',
        title: `[${stepNum++}/${totalStepCount}] ${
          burnMode
            ? (isMyanmar ? 'Burn Myanmar Subtitles (Padauk HarfBuzz)' : 'Burn English Subtitles (FFmpeg libass)')
            : 'Mux Soft Subtitles (mov_text)'
        }`,
      } : null,
    };

    // 1. Print permanent job header to scroll history
    pushStatic({ id: `job_start_${Date.now()}`, type: 'job_header', text: `▶ Pipeline Job: ${video.fileName}` });

    setRunningState({
      elapsedTime: '0s',
      isCompleted: false,
      isFailed: false,
    });
    setScreen('running');

    // Timer for live dynamic spinner line
    const timer = setInterval(() => {
      setRunningState(prev => {
        if (!prev) return null;
        const elapsedSec = Math.floor((Date.now() - totalStartTime) / 1000);
        return { ...prev, elapsedTime: `${elapsedSec}s` };
      });
    }, 1000);

    const dir = video.dir;
    const baseName = video.baseName;
    const ext = video.ext;
    const safeId = video.safeId || generateSafeHash(video.fileName, 8);

    // Safe 8-character ASCII intermediate paths for C++ tools (prevents Unicode Windows crashes)
    const safeTempWav = path.join(dir, `_temp_${safeId}_16k.wav`);
    const safeTempWhisperPrefix = path.join(dir, `_temp_${safeId}`);
    const safeTempWhisperSrt = path.join(dir, `_temp_${safeId}.srt`);
    const safeTempWhisperJson = path.join(dir, `_temp_${safeId}.json`);

    // Target human-readable outputs
    const enSrt = path.join(dir, `${baseName}.srt`);
    const mySrt = path.join(dir, `${baseName}_my.srt`);
    const finalVideo = isMyanmar
      ? path.join(dir, `${baseName}_my_subtitled${ext}`)
      : path.join(dir, `${baseName}_subtitled${ext}`);

    let activeSrt = isMyanmar ? (fs.existsSync(mySrt) ? mySrt : enSrt) : enSrt;

    try {
      // Step 0: Metadata Probe with tiny.en
      if (shouldProbe) {
        pushStatic({ id: `step_start_probe`, type: 'step_start', title: stepDefs.probe.title });
        const sTime = Date.now();
        addStaticLog(`Running fast vocabulary probe with tiny.en (RNNoise vocal isolation)...`);

        const probeResult = await runMetadataProbe(video.fullPath, {
          onLog: msg => addStaticLog(msg),
          onProgress: progress => {
            if (progress?.cue) {
              addStaticLog(progress.cue);
            }
          },
        });

        const dSec = Math.max(1, Math.floor((Date.now() - sTime) / 1000));
        addStaticLog(`Probe metadata generated: ${path.basename(probeResult.promptPath)}`);
        pushStatic({ id: `step_done_probe`, type: 'step_done', text: `✓ Step completed in ${dSec}s` });
      }

      // Step 1: Audio Extraction
      if (shouldExtract) {
        // Print Step 1 Header FIRST
        pushStatic({ id: `step_start_extract`, type: 'step_start', title: stepDefs.extract.title });
        const sTime = Date.now();
        addStaticLog(`Extracting audio with speech bandpass filter (80-7500Hz)${isLargeTurbo ? '' : ' & dynaudnorm'}...`);

        await extractAudio(video.fullPath, safeTempWav, { 
          language, 
          isLargeTurbo,
          modelProfile: activeModel,
          audioFilter: activeModel?.audioFilter,
        });

        const dSec = Math.max(1, Math.floor((Date.now() - sTime) / 1000));
        addStaticLog(`Audio extracted & normalized (16kHz PCM): ${path.basename(safeTempWav)}`);
        // Print Step 1 Completion MARKER
        pushStatic({ id: `step_done_extract`, type: 'step_done', text: `✓ Step completed in ${dSec}s` });
      }

      // Step 2: Whisper Transcription
      if (shouldTranscribe) {
        // Print Step 2 Header FIRST
        pushStatic({ id: `step_start_whisper`, type: 'step_start', title: stepDefs.whisper.title });
        const sTime = Date.now();
        const activeModel = getActiveModel();
        const modelLabel = activeModel?.displayName || 'Active Whisper Model';
        addStaticLog(`Transcribing audio with Whisper [${modelLabel}] [Language: ${language.toUpperCase()}]...`);

        // Check for dynamic prompt file (_temp_${safeId}_prompt.txt or <baseName>_prompt.txt)
        const tempPromptFile = path.join(dir, `_temp_${safeId}_prompt.txt`);
        const userPromptFile = path.join(dir, `${baseName}_prompt.txt`);
        let dynamicPrompt = null;
        const allowPrompt = jobConfig.usePrompt !== false && (manualPlan ? Boolean(manualPlan.extractMetadata) : true);

        if (allowPrompt) {
          if (fs.existsSync(tempPromptFile)) {
            dynamicPrompt = fs.readFileSync(tempPromptFile, 'utf-8').trim();
          } else if (fs.existsSync(userPromptFile)) {
            dynamicPrompt = fs.readFileSync(userPromptFile, 'utf-8').trim();
          }
        }

        // When user rejects prompt/probe (or no prompt file exists):
        // - Cloud model: strictly null / unconditioned (no prompt passed to Groq)
        // - Local models: inject default grammar prompt for proper punctuation and capitalization
        if (!dynamicPrompt && !isCloud) {
          dynamicPrompt = "Transcribe the dialogue with clear grammar, proper punctuation, and capitalization.";
        }

        if (dynamicPrompt) {
          const preview = dynamicPrompt.length > 70 ? `${dynamicPrompt.slice(0, 70)}...` : dynamicPrompt;
          addStaticLog(`[Dynamic Prompt] Injected context: "${preview}"`);
        } else {
          addStaticLog(`[Audio Context] Clean unconditioned transcription (No prompt)`);
        }

        if (activeModel?.isCloud) {
          addStaticLog(`[Engine: Cloud] Transcribing via Groq Whisper (${activeModel?.modelName || 'whisper-large-v3-turbo'})...`);
          await transcribeAudioGroqCloud(
            safeTempWav,
            enSrt,
            { language, prompt: dynamicPrompt, modelProfile: activeModel },
            progress => {
              if (progress?.status) {
                addStaticLog(progress.status);
              }
            }
          );
        } else {
          addStaticLog(`[Engine: Local] Transcribing via whisper.cpp [${modelLabel}]...`);
          await transcribeAudio(
            safeTempWav,
            safeTempWhisperPrefix,
            { language, prompt: dynamicPrompt, modelProfile: activeModel },
            progress => {
              if (progress?.cue) {
                addStaticLog(progress.cue);
              }
            }
          );

          // Sanitize and save generated subtitles
          if (activeModel?.useJsonOutput && fs.existsSync(safeTempWhisperJson)) {
            addStaticLog(`Normalizing full sentences & gaps via srtNormalizer (compromise NLP)...`);
            normalizeSrtFromJson(safeTempWhisperJson, enSrt, activeModel);
            try { fs.unlinkSync(safeTempWhisperJson); } catch {}
          } else if (fs.existsSync(safeTempWhisperSrt)) {
            const rawCues = readSrtFile(safeTempWhisperSrt);
            const sanitizedCues = sanitizeSrtEntries(rawCues);
            writeSrtFile(enSrt, sanitizedCues);
            try { fs.unlinkSync(safeTempWhisperSrt); } catch {}
          }
        }

                if (fs.existsSync(safeTempWav)) {
          try { fs.unlinkSync(safeTempWav); } catch {}
        }

        const dSec = Math.max(1, Math.floor((Date.now() - sTime) / 1000));
        addStaticLog(`Subtitles generated: ${path.basename(enSrt)}`);
        // Print Step 2 Completion MARKER
        pushStatic({ id: `step_done_whisper`, type: 'step_done', text: `✓ Step completed in ${dSec}s` });
      } else if (reuseSrt) {
        addStaticLog(`Reusing existing subtitle: ${path.basename(enSrt)} (Whisper skipped)`);
      }

      // Step 3: Myanmar Translation
      if (shouldTranslate) {
        // Print Step 3 Header FIRST
        pushStatic({ id: `step_start_translate`, type: 'step_start', title: stepDefs.translate.title });
        const sTime = Date.now();
        addStaticLog(`Connecting to ${currentProvider.toUpperCase()} (${currentProvider === 'groq' ? CONFIG.groq.model : CONFIG.gemini.model})...`);

        // Check for character & scene context prompt from probe or file
        const tempPromptFile = path.join(dir, `_temp_${safeId}_prompt.txt`);
        const userPromptFile = path.join(dir, `${baseName}_prompt.txt`);
        let contextPrompt = null;
        if (fs.existsSync(tempPromptFile)) {
          contextPrompt = fs.readFileSync(tempPromptFile, 'utf-8').trim();
        } else if (fs.existsSync(userPromptFile)) {
          contextPrompt = fs.readFileSync(userPromptFile, 'utf-8').trim();
        }

        if (contextPrompt) {
          const preview = contextPrompt.length > 70 ? `${contextPrompt.slice(0, 70)}...` : contextPrompt;
          addStaticLog(`[Translation Context] Injected character metadata for pronoun precision: "${preview}"`);
        }

        await translateSrtFile(enSrt, mySrt, {
          provider: currentProvider,
          contextPrompt,
          onLog: msg => addStaticLog(msg),
        });

        const dSec = Math.max(1, Math.floor((Date.now() - sTime) / 1000));
        addStaticLog(`Myanmar subtitles saved: ${path.basename(mySrt)}`);
        // Print Step 3 Completion MARKER
        pushStatic({ id: `step_done_translate`, type: 'step_done', text: `✓ Step completed in ${dSec}s` });
        activeSrt = mySrt;
      } else if (isMyanmar && fs.existsSync(mySrt)) {
        activeSrt = mySrt;
        addStaticLog(`Using existing Myanmar subtitle: ${path.basename(mySrt)} (Translation skipped)`);
      }

      // Step 4: Video Rendering
      if (shouldRender) {
        // Print Step 4 Header FIRST
        pushStatic({ id: `step_start_render`, type: 'step_start', title: stepDefs.render.title });
        const sTime = Date.now();

        if (burnMode) {
          if (isMyanmar) {
            const targetSrt = fs.existsSync(mySrt) ? mySrt : activeSrt;
            addStaticLog(`Converting to ASS and burning ${path.basename(targetSrt)} with Padauk font & HarfBuzz complex shaping...`);
            await burnMyanmarSubtitles(video.fullPath, targetSrt, finalVideo);
          } else {
            addStaticLog('Burning English subtitles with FFmpeg libass...');
            await burnEnglishSubtitles(video.fullPath, activeSrt, finalVideo);
          }
        } else {
          const targetSrt = isMyanmar && fs.existsSync(mySrt) ? mySrt : activeSrt;
          addStaticLog(`Muxing soft subtitle track (${path.basename(targetSrt)})...`);
          await muxSoftSubtitles(video.fullPath, targetSrt, finalVideo);
        }

        const dSec = Math.max(1, Math.floor((Date.now() - sTime) / 1000));
        addStaticLog(`Subtitled video created: ${path.basename(finalVideo)}`);
        // Print Step 4 Completion MARKER
        pushStatic({ id: `step_done_render`, type: 'step_done', text: `✓ Step completed in ${dSec}s` });
      }

      clearInterval(timer);
      const totalDurationSec = Math.max(1, Math.floor((Date.now() - totalStartTime) / 1000));
      const cues = readSrtFile(activeSrt);

      // Print permanent completion summary to scroll history
      pushStatic({
        id: `job_summary_${Date.now()}`,
        type: 'summary',
        outputVideo: shouldRender ? path.basename(finalVideo) : null,
        srtFile: path.basename(activeSrt),
        location: path.relative(process.cwd(), dir) || './testContents',
        cueCount: cues ? cues.length : null,
        duration: `${totalDurationSec}s`,
      });

      // Subtle terminal notification chime / taskbar highlight on finish
      try {
        process.stdout.write('\x07');
      } catch {}

      // Transition live region to Next Action selector
      setRunningState({
        isCompleted: true,
        isFailed: false,
      });
    } catch (err) {
      clearInterval(timer);
      if (fs.existsSync(safeTempWav)) {
        try { fs.unlinkSync(safeTempWav); } catch {}
      }
      if (fs.existsSync(safeTempWhisperSrt)) {
        try { fs.unlinkSync(safeTempWhisperSrt); } catch {}
      }
      addStaticLog(`[ERROR] ${err.message}`);
      pushStatic({
        id: `job_error_${Date.now()}`,
        type: 'error',
        message: err.message,
      });
      setRunningState({
        isCompleted: false,
        isFailed: true,
      });
    }
  };

  return h(
    Box,
    { flexDirection: 'column' },

    // 1. INK STATIC: Renders chronologically into terminal scroll history: Header -> Logs -> Complete!
    h(
      Static,
      { items: staticItems },
      item => {
        if (item.type === 'job_header') {
          return h(
            Box,
            { key: item.id, marginTop: 1, marginBottom: 0 },
            h(Text, { color: 'cyan', bold: true }, item.text)
          );
        }
        if (item.type === 'step_start') {
          return h(
            Box,
            { key: item.id, marginTop: 1 },
            h(Text, { color: 'cyan', bold: true }, `▶ ${item.title}`)
          );
        }
        if (item.type === 'step_done') {
          return h(
            Box,
            { key: item.id, marginLeft: 2, marginBottom: 0 },
            h(Text, { color: 'green', bold: true }, item.text)
          );
        }
        if (item.type === 'log') {
          let logColor = 'gray';
          if (item.text.includes('[ERROR]') || item.text.includes('failed')) logColor = 'red';
          else if (item.text.includes('[Warning]')) logColor = 'yellow';
          else if (item.text.includes('[Success]') || item.text.includes('complete') || item.text.includes('saved') || item.text.includes('created')) logColor = 'green';
          else if (item.text.includes('Batch') || item.text.includes('Sending')) logColor = 'cyan';

          return h(
            Box,
            { key: item.id, marginLeft: 2 },
            h(Text, { color: 'gray' }, '> '),
            h(Text, { color: logColor }, item.text)
          );
        }
        if (item.type === 'summary') {
          return h(
            Box,
            {
              key: item.id,
              flexDirection: 'column',
              borderStyle: 'round',
              borderColor: 'greenBright',
              paddingX: 2,
              paddingY: 0,
              marginTop: 1,
              marginBottom: 1,
            },
            h(
              Box,
              { justifyContent: 'space-between', marginBottom: 1 },
              h(Text, { color: 'greenBright', bold: true }, 'Pipeline Completed Successfully!'),
              h(Text, { color: 'yellowBright', bold: true }, `[Duration: ${item.duration}]`)
            ),
            item.outputVideo
              ? h(
                  Box,
                  { marginBottom: 0 },
                  h(Box, { width: 16 }, h(Text, { color: 'cyan', bold: true }, 'Video Output: ')),
                  h(Text, { color: 'white', wrap: 'truncate-end' }, item.outputVideo)
                )
              : null,
            item.srtFile
              ? h(
                  Box,
                  { marginBottom: 0 },
                  h(Box, { width: 16 }, h(Text, { color: 'magentaBright', bold: true }, 'Subtitle File: ')),
                  h(Text, { color: 'white', wrap: 'truncate-end' }, item.srtFile)
                )
              : null,
            item.location
              ? h(
                  Box,
                  { marginBottom: 0 },
                  h(Box, { width: 16 }, h(Text, { color: 'gray', bold: true }, 'Location: ')),
                  h(Text, { color: 'gray' }, item.location)
                )
              : null,
            item.cueCount
              ? h(
                  Box,
                  { marginBottom: 0 },
                  h(Box, { width: 16 }, h(Text, { color: 'cyan', bold: true }, 'Total Cues: ')),
                  h(Text, { color: 'yellowBright', bold: true }, `${item.cueCount} cues`)
                )
              : null
          );
        }
        if (item.type === 'error') {
          return h(
            Box,
            { key: item.id, flexDirection: 'column', marginTop: 1 },
            h(Text, { color: 'red', bold: true }, 'Pipeline Execution Failed:'),
            h(Text, { color: 'red' }, item.message)
          );
        }
        return null;
      }
    ),

    // 2. DYNAMIC REGION: Menu / Selectors / In-progress spinner under the active step
    screen === 'menu'
      ? h(
          Box,
          { flexDirection: 'column' },
          h(StatusBar, { currentProvider }),
          h(MainMenu, {
            onSelect: opt => {
              if (opt === 'exit') {
                process.exit(0);
              } else if (opt === 'modelManager') {
                setScreen('modelManager');
              } else if (opt === 'magic') {
                setSelectedVideoEntry(null);
                setScreen('magic');
              } else if (opt === 'manualPlanner') {
                setSelectedVideoEntry(null);
                setScreen('manualPlanner');
              } else if (opt === 'fileManager') {
                setScreen('fileManager');
              } else if (opt === 'providerSelect') {
                setScreen('providerSelect');
              }
            },
          })
        )
      : null,

    screen === 'modelManager' || screen === 'modelManagerRequired'
      ? h(ModelManagerView, {
          requiredWarning: screen === 'modelManagerRequired',
          onBack: () => setScreen('menu'),
        })
      : null,

    screen === 'providerSelect'
      ? h(ProviderSelector, {
          currentProvider,
          onSelect: prov => {
            setCurrentProvider(prov);
            setScreen('menu');
          },
          onBack: () => setScreen('menu'),
        })
      : null,

    screen === 'fileManager'
      ? h(FileManagerView, {
          onSelectVideoForWorkflow: (vid, wf) => {
            setSelectedVideoEntry(vid);
            setScreen(wf === 'manual' ? 'manualPlanner' : 'magic');
          },
          onViewSrt: srtPath => {
            setActiveSrtPath(srtPath);
            setScreen('srtViewer');
          },
          onBack: () => setScreen('menu'),
        })
      : null,

    screen === 'srtViewer'
      ? h(SrtViewer, {
          srtPath: activeSrtPath,
          onBack: () => setScreen('fileManager'),
        })
      : null,

    screen === 'magic'
      ? h(MagicModeView, {
          preselectedVideo: selectedVideoEntry,
          onStartJob: startJob,
          onBack: () => setScreen('menu'),
        })
      : null,

    screen === 'manualPlanner'
      ? h(ManualPlannerView, {
          preselectedVideo: selectedVideoEntry,
          onStartJob: startJob,
          onBack: () => setScreen('menu'),
        })
      : null,

    screen === 'running' && runningState
      ? h(PipelineRunner, {
          elapsedTime: runningState.elapsedTime,
          isCompleted: runningState.isCompleted,
          isFailed: runningState.isFailed,
          onDone: dest => {
            if (dest === 'exit') {
              process.exit(0);
            }
            setRunningState(null);
            setSelectedVideoEntry(null);
            setScreen(dest === 'fileManager' ? 'fileManager' : 'menu');
          },
        })
      : null
  );
}
