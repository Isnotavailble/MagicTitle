import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { scanDirectoryForVideos } from '../core/fileScanner.js';

export function ManualPlannerView({ preselectedVideo, onStartJob, onBack }) {
  const [step, setStep] = useState(preselectedVideo ? 'steps' : 'select_video');
  const [video, setVideo] = useState(preselectedVideo || null);
  const [extractAudio, setExtractAudio] = useState(true);
  const [transcribe, setTranscribe] = useState(true);
  const [translate, setTranslate] = useState(true);
  const [renderVideo, setRenderVideo] = useState(true);
  const [burnMode, setBurnMode] = useState(true); // true = hard burn, false = soft mux

  const h = React.createElement;
  const videos = scanDirectoryForVideos();

  if (step === 'select_video') {
    const items = videos.map(v => ({
      key: `video_${v.fileName}`,
      label: `${v.fileName} ${v.hasEnSrt ? '[EN SRT FOUND]' : ''}`,
      value: v,
    }));
    items.push({ key: 'action_back', label: '↩ Back to Main Menu', value: 'back' });

    return h(
      Box,
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'green', padding: 1 },
      h(Text, { bold: true, color: 'green', marginBottom: 1 }, '🛠️  Manual Planner - Select Target Video:'),
      h(SelectInput, {
        items,
        onSelect: item => {
          if (item.value === 'back') onBack();
          else {
            setVideo(item.value);
            // If English SRT already exists, default extract & transcribe to false
            if (item.value.hasEnSrt) {
              setExtractAudio(false);
              setTranscribe(false);
            }
            setStep('steps');
          }
        },
      })
    );
  }

  if (step === 'steps') {
    const items = [
      {
        label: `${extractAudio ? '[✓]' : '[ ]'} 1. Extract 16kHz Audio (FFmpeg bandpass + dynaudnorm)`,
        value: 'toggle_extract',
      },
      {
        label: `${transcribe ? '[✓]' : '[ ]'} 2. Transcribe Audio (whisper.cpp ggml-small-q5_1)`,
        value: 'toggle_transcribe',
      },
      {
        label: `${translate ? '[✓]' : '[ ]'} 3. Translate to Myanmar Unicode (AI Cloud SDK)`,
        value: 'toggle_translate',
      },
      {
        label: `${renderVideo ? '[✓]' : '[ ]'} 4. Render Video with Subtitles`,
        value: 'toggle_render',
      },
    ];

    if (renderVideo) {
      items.push({
        label: `   └─ Output Mode: ${burnMode ? '🔥 Hard Burn (Padauk + HarfBuzz)' : '⚡ Soft Mux (mov_text)'}`,
        value: 'toggle_burn',
      });
    }

    items.push({
      label: '▶  START MANUAL PLAN EXECUTION',
      value: 'execute',
    });

    items.push({
      label: '↩ Back',
      value: 'back',
    });

    const handleSelect = item => {
      if (item.value === 'back') {
        if (preselectedVideo) onBack();
        else setStep('select_video');
      } else if (item.value === 'toggle_extract') {
        setExtractAudio(v => !v);
      } else if (item.value === 'toggle_transcribe') {
        setTranscribe(v => !v);
      } else if (item.value === 'toggle_translate') {
        setTranslate(v => !v);
      } else if (item.value === 'toggle_render') {
        setRenderVideo(v => !v);
      } else if (item.value === 'toggle_burn') {
        setBurnMode(v => !v);
      } else if (item.value === 'execute') {
        onStartJob({
          video,
          workflow: translate ? 'myanmar' : 'english',
          reuseSrt: !transcribe && video.hasEnSrt,
          burnMode,
          manualPlan: {
            extractAudio,
            transcribe,
            translate,
            renderVideo,
            burnMode,
          },
          modeName: 'manual',
        });
      }
    };

    return h(
      Box,
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'green', padding: 1 },
      h(Text, { bold: true, color: 'white', marginBottom: 1 }, `Plan Steps for: ${video.fileName}`),
      h(Text, { color: 'gray', marginBottom: 1 }, 'Toggle steps on or off, then choose Start:'),
      h(SelectInput, { items, onSelect: handleSelect })
    );
  }

  return null;
}
