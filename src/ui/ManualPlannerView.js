import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { scanDirectoryForVideos } from '../core/fileScanner.js';
import { GlowingIndicator, GlowingItem, VideoPickerItem, FooterBar } from './GlowingIndicator.js';
import { UrlDownloadView } from './UrlDownloadView.js';

export function ManualPlannerView({ preselectedVideo, onStartJob, onBack }) {
  const [step, setStep] = useState(preselectedVideo ? 'steps' : 'select_video');
  const [video, setVideo] = useState(preselectedVideo || null);
  const [extractAudio, setExtractAudio] = useState(true);
  const [transcribe, setTranscribe] = useState(true);
  const [language, setLanguage] = useState('en'); // 'en', 'auto'
  const [translate, setTranslate] = useState(true);
  const [renderVideo, setRenderVideo] = useState(true);
  const [burnMode, setBurnMode] = useState(true); // true = hard burn, false = soft mux

  const h = React.createElement;
  const videos = scanDirectoryForVideos();

  // STEP 0: Download from URL
  if (step === 'download_url') {
    return h(UrlDownloadView, {
      onVideoReady: downloadedVideo => {
        setVideo(downloadedVideo);
        if (downloadedVideo.hasEnSrt) {
          setExtractAudio(false);
          setTranscribe(false);
        } else {
          setExtractAudio(true);
          setTranscribe(true);
        }
        setStep('steps');
      },
      onBack: () => setStep('select_video'),
    });
  }

  // STEP 1: Select Video
  if (step === 'select_video') {
    const items = [
      {
        key: 'action_download_url',
        label: 'Download Video from URL',
        value: 'download_url',
      },
      ...videos.map((v, i) => ({
        key: `video_${v.fileName}_${v.safeId || i}`,
        label: v.fileName,
        value: v,
      })),
      { key: 'action_back', label: 'Back to Main Menu', value: 'back' },
    ];

    return h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
        h(Text, { bold: true, color: 'cyan', marginBottom: 1 }, 'Manual Planner - Select Target Video:'),
        h(SelectInput, {
          items,
          indicatorComponent: GlowingIndicator,
          itemComponent: VideoPickerItem,
          onSelect: item => {
            if (item.value === 'back') onBack();
            else if (item.value === 'download_url') setStep('download_url');
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
      ),
      h(FooterBar, { hints: '[↑/↓] Choose Video  •  [ENTER] Customize Pipeline Steps' })
    );
  }

  // STEP 2: Customize Plan Steps
  if (step === 'steps') {
    const items = [
      {
        key: 'step_toggle_extract',
        label: `${extractAudio ? '[✓]' : '[ ]'} 1. Extract 16kHz Audio (FFmpeg bandpass + dynaudnorm)`,
        value: 'toggle_extract',
      },
      {
        key: 'step_toggle_transcribe',
        label: `${transcribe ? '[✓]' : '[ ]'} 2. Transcribe Audio (whisper.cpp ggml-small-q5_1)`,
        value: 'toggle_transcribe',
      },
    ];

    if (transcribe) {
      const langLabel = language === 'en' ? 'English (Default)' : 'Dynamic (Auto-Detect)';
      items.push({
        key: 'step_cycle_lang',
        label: `   └─ Speech Language: [ ${langLabel} ] (Click to toggle)`,
        value: 'cycle_language',
      });
    }

    items.push({
      key: 'step_toggle_translate',
      label: `${translate ? '[✓]' : '[ ]'} 3. Translate to Myanmar Unicode (AI Cloud SDK)`,
      value: 'toggle_translate',
    });

    items.push({
      key: 'step_toggle_render',
      label: `${renderVideo ? '[✓]' : '[ ]'} 4. Render Video with Subtitles`,
      value: 'toggle_render',
    });

    if (renderVideo) {
      items.push({
        key: 'step_toggle_burn',
        label: `   └─ Output Mode: ${burnMode ? 'Hard Burn (Padauk + HarfBuzz)' : 'Soft Mux (mov_text)'}`,
        value: 'toggle_burn',
      });
    }

    items.push({
      key: 'step_action_execute',
      label: 'START MANUAL PLAN EXECUTION',
      value: 'execute',
    });

    items.push({
      key: 'step_action_back',
      label: 'Back',
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
      } else if (item.value === 'cycle_language') {
        setLanguage(curr => (curr === 'en' ? 'auto' : 'en'));
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
          language,
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
      { flexDirection: 'column' },
      h(
        Box,
        { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
        h(
          Box,
          { marginBottom: 1 },
          h(Text, { bold: true, color: 'white' }, `Plan Steps for: ${video.fileName} `),
          h(Text, { color: video.hasEnSrt ? 'greenBright' : 'gray', bold: video.hasEnSrt }, video.hasEnSrt ? '[EN: READY]' : '[EN: --   ]')
        ),
        h(Text, { color: 'gray', marginBottom: 1 }, 'Toggle steps on or off, then choose Start:'),
        h(SelectInput, { items, indicatorComponent: GlowingIndicator, itemComponent: GlowingItem, onSelect: handleSelect })
      ),
      h(FooterBar, { hints: '[↑/↓] Navigate  •  [ENTER] Toggle / Cycle Language / Run  •  [ESC/Back] Return' })
    );
  }

  return null;
}
