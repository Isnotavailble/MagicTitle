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

import { extractAudio, burnEnglishSubtitles, burnMyanmarSubtitles, muxSoftSubtitles } from './core/ffmpeg.js';
import { transcribeAudio } from './core/whisper.js';
import { translateSrtFile } from './services/translator.js';
import { readSrtFile } from './core/srt.js';
import { CONFIG } from './config.js';

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
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const logText = `[${timeStr}] ${msg}`;
    pushStatic({ id: `log_${++logIdCounter}`, type: 'log', text: logText });
  };

  // Run the pipeline job (GitHub Actions chronological order: Step Header -> Logs -> Complete)
  const startJob = async (jobConfig) => {
    const { video, workflow, reuseSrt, burnMode, manualPlan } = jobConfig;
    const isMyanmar = workflow === 'myanmar';
    const totalStartTime = Date.now();

    // Determine required steps
    const shouldExtract = manualPlan ? manualPlan.extractAudio : !reuseSrt;
    const shouldTranscribe = manualPlan ? manualPlan.transcribe : !reuseSrt;
    const shouldTranslate = manualPlan ? manualPlan.translate : isMyanmar;
    const shouldRender = manualPlan ? manualPlan.renderVideo : true;

    let stepNum = 1;
    const totalStepCount = (shouldExtract ? 1 : 0) + (shouldTranscribe ? 1 : 0) + (shouldTranslate ? 1 : 0) + (shouldRender ? 1 : 0);

    const stepDefs = {
      extract: shouldExtract ? { id: 'extract', title: `[${stepNum++}/${totalStepCount}] Extract 16kHz Audio (FFmpeg bandpass)` } : null,
      whisper: shouldTranscribe ? { id: 'whisper', title: `[${stepNum++}/${totalStepCount}] Speech-to-Text with Whisper (small-q5_1)` } : null,
      translate: shouldTranslate ? { id: 'translate', title: `[${stepNum++}/${totalStepCount}] Myanmar Translation (${currentProvider.toUpperCase()})` } : null,
      render: shouldRender ? { id: 'render', title: `[${stepNum++}/${totalStepCount}] ${burnMode ? 'Burn Subtitles (Padauk HarfBuzz)' : 'Mux Soft Subtitles (mov_text)'}` } : null,
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

    const tempWav = path.join(dir, `${baseName}_temp_16k.wav`);
    const enSrt = path.join(dir, `${baseName}.srt`);
    const mySrt = path.join(dir, `${baseName}_my.srt`);
    const finalVideo = isMyanmar
      ? path.join(dir, `${baseName}_my_subtitled${ext}`)
      : path.join(dir, `${baseName}_subtitled${ext}`);

    let activeSrt = enSrt;

    try {
      // Step 1: Audio Extraction
      if (shouldExtract) {
        // Print Step 1 Header FIRST
        pushStatic({ id: `step_start_extract`, type: 'step_start', title: stepDefs.extract.title });
        const sTime = Date.now();
        addStaticLog('Extracting audio with speech bandpass filter (80-7500Hz) & dynaudnorm...');

        await extractAudio(video.fullPath, tempWav);

        const dSec = Math.max(1, Math.floor((Date.now() - sTime) / 1000));
        addStaticLog(`Audio extracted & normalized (16kHz PCM): ${path.basename(tempWav)}`);
        // Print Step 1 Completion MARKER
        pushStatic({ id: `step_done_extract`, type: 'step_done', text: `✓ Step completed in ${dSec}s` });
      }

      // Step 2: Whisper Transcription
      if (shouldTranscribe) {
        // Print Step 2 Header FIRST
        pushStatic({ id: `step_start_whisper`, type: 'step_start', title: stepDefs.whisper.title });
        const sTime = Date.now();
        addStaticLog(`Running whisper.cpp with ggml-small-q5_1.bin (${CONFIG.whisper.threads} threads)...`);

        const prefix = path.join(dir, baseName);
        await transcribeAudio(tempWav, prefix, progress => {
          if (progress?.cue) {
            addStaticLog(progress.cue);
          }
        });

        if (fs.existsSync(tempWav)) {
          try { fs.unlinkSync(tempWav); } catch {}
        }

        const dSec = Math.max(1, Math.floor((Date.now() - sTime) / 1000));
        addStaticLog(`English subtitles generated: ${path.basename(enSrt)}`);
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

        await translateSrtFile(enSrt, mySrt, {
          provider: currentProvider,
          onLog: msg => addStaticLog(msg),
        });

        const dSec = Math.max(1, Math.floor((Date.now() - sTime) / 1000));
        addStaticLog(`Myanmar subtitles saved: ${path.basename(mySrt)}`);
        // Print Step 3 Completion MARKER
        pushStatic({ id: `step_done_translate`, type: 'step_done', text: `✓ Step completed in ${dSec}s` });
        activeSrt = mySrt;
      }

      // Step 4: Video Rendering
      if (shouldRender) {
        // Print Step 4 Header FIRST
        pushStatic({ id: `step_start_render`, type: 'step_start', title: stepDefs.render.title });
        const sTime = Date.now();

        if (burnMode) {
          if (isMyanmar) {
            addStaticLog('Converting to ASS and burning with Padauk font & HarfBuzz complex shaping...');
            await burnMyanmarSubtitles(video.fullPath, activeSrt, finalVideo);
          } else {
            addStaticLog('Burning English subtitles with FFmpeg libass...');
            await burnEnglishSubtitles(video.fullPath, activeSrt, finalVideo);
          }
        } else {
          addStaticLog('Muxing soft subtitle track (mov_text)...');
          await muxSoftSubtitles(video.fullPath, activeSrt, finalVideo);
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
        outputVideo: shouldRender ? finalVideo : null,
        srtFile: activeSrt,
        cueCount: cues ? cues.length : null,
        duration: `${totalDurationSec}s`,
      });

      // Transition live region to Next Action selector
      setRunningState({
        isCompleted: true,
        isFailed: false,
      });
    } catch (err) {
      clearInterval(timer);
      if (fs.existsSync(tempWav)) {
        try { fs.unlinkSync(tempWav); } catch {}
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
            { key: item.id, flexDirection: 'column', marginTop: 1, marginBottom: 1 },
            h(Text, { color: 'green', bold: true }, `🎉 Pipeline Completed Successfully! (Total duration: ${item.duration})`),
            item.outputVideo
              ? h(
                  Box,
                  null,
                  h(Text, { color: 'cyan', bold: true }, 'Video Output:  '),
                  h(Text, { color: 'white' }, item.outputVideo)
                )
              : null,
            item.srtFile
              ? h(
                  Box,
                  null,
                  h(Text, { color: 'magenta', bold: true }, 'Subtitle File: '),
                  h(Text, { color: 'white' }, item.srtFile)
                )
              : null,
            item.cueCount
              ? h(
                  Box,
                  null,
                  h(Text, { color: 'cyan', bold: true }, 'Total Cues:    '),
                  h(Text, { color: 'yellowBright', bold: true }, `${item.cueCount} cues`)
                )
              : null
          );
        }
        if (item.type === 'error') {
          return h(
            Box,
            { key: item.id, flexDirection: 'column', marginTop: 1 },
            h(Text, { color: 'red', bold: true }, '❌ Pipeline Execution Failed:'),
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
              if (opt === 'exit') process.exit(0);
              else if (opt === 'magic') {
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
            if (dest === 'exit') process.exit(0);
            setRunningState(null);
            setSelectedVideoEntry(null);
            setScreen(dest === 'fileManager' ? 'fileManager' : 'menu');
          },
        })
      : null
  );
}
