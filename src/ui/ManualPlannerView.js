import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { scanDirectoryForVideos } from '../core/fileScanner.js';
import { GlowingIndicator, GlowingItem, VideoPickerItem, FooterBar } from './GlowingIndicator.js';
import { UrlDownloadView } from './UrlDownloadView.js';

export function ManualPlannerView({ preselectedVideo, onStartJob, onBack }) {
  const [step, setStep] = useState(preselectedVideo ? 'steps' : 'select_video');
  const [video, setVideo] = useState(preselectedVideo || null);
  const [extractMetadata, setExtractMetadata] = useState(false);
  const [extractAudio, setExtractAudio] = useState(preselectedVideo ? !preselectedVideo.hasEnSrt : true);
  const [transcribe, setTranscribe] = useState(preselectedVideo ? !preselectedVideo.hasEnSrt : true);
  const [language, setLanguage] = useState('en'); // 'en', 'auto'
  const [translate, setTranslate] = useState(preselectedVideo ? !preselectedVideo.hasMySrt : true);
  const [targetSubtitleLanguage, setTargetSubtitleLanguage] = useState('myanmar');
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
              const selectedVid = item.value;
              setVideo(selectedVid);
              // If English SRT already exists, default extract & transcribe to false
              if (selectedVid.hasEnSrt) {
                setExtractAudio(false);
                setTranscribe(false);
              }
              // If Myanmar SRT exists, default translate to false
              if (selectedVid.hasMySrt) {
                setTranslate(false);
                setTargetSubtitleLanguage('myanmar');
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
        key: 'step_toggle_metadata',
        label: `${extractMetadata ? '[✓]' : '[ ]'} 0. Extract Metadata Probe with tiny.en (Generates _prompt.txt)`,
        value: 'toggle_metadata',
      },
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
      const effectiveSubLang = translate ? 'myanmar' : targetSubtitleLanguage;
      if (!translate) {
        items.push({
          key: 'step_cycle_sub_lang',
          label: `   ├─ Subtitle Language: [ ${effectiveSubLang === 'myanmar' ? 'Myanmar (_my.srt)' : 'English (.srt)'} ] (Click to toggle)`,
          value: 'cycle_sub_lang',
        });
      }
      items.push({
        key: 'step_toggle_burn',
        label: `   └─ Output Mode: ${burnMode ? `Hard Burn (${effectiveSubLang === 'myanmar' ? 'Padauk + HarfBuzz' : 'FFmpeg libass'})` : 'Soft Mux (mov_text)'}`,
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
      } else if (item.value === 'toggle_metadata') {
        setExtractMetadata(v => !v);
      } else if (item.value === 'toggle_extract') {
        setExtractAudio(v => !v);
      } else if (item.value === 'toggle_transcribe') {
        setTranscribe(v => !v);
      } else if (item.value === 'cycle_language') {
        setLanguage(curr => (curr === 'en' ? 'auto' : 'en'));
      } else if (item.value === 'toggle_translate') {
        setTranslate(v => !v);
      } else if (item.value === 'cycle_sub_lang') {
        setTargetSubtitleLanguage(curr => (curr === 'myanmar' ? 'english' : 'myanmar'));
      } else if (item.value === 'toggle_render') {
        setRenderVideo(v => !v);
      } else if (item.value === 'toggle_burn') {
        setBurnMode(v => !v);
      } else if (item.value === 'execute') {
        const effectiveWorkflow = translate ? 'myanmar' : targetSubtitleLanguage;
        onStartJob({
          video,
          workflow: effectiveWorkflow,
          language,
          reuseSrt: !transcribe && video.hasEnSrt,
          reuseMySrt: !translate && effectiveWorkflow === 'myanmar' && video.hasMySrt,
          usePrompt: extractMetadata,
          burnMode,
          manualPlan: {
            extractMetadata,
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
          h(Text, { color: video.hasEnSrt ? 'greenBright' : 'gray', bold: video.hasEnSrt }, video.hasEnSrt ? '[EN: READY] ' : '[EN: --   ] '),
          h(Text, { color: video.hasMySrt ? 'magentaBright' : 'gray', bold: video.hasMySrt }, video.hasMySrt ? '[MY: READY]' : '[MY: --   ]')
        ),
        h(Text, { color: 'gray', marginBottom: 1 }, 'Toggle steps on or off, then choose Start:'),
        h(SelectInput, { items, indicatorComponent: GlowingIndicator, itemComponent: GlowingItem, onSelect: handleSelect })
      ),
      h(FooterBar, { hints: '[↑/↓] Navigate  •  [ENTER] Toggle / Cycle Language / Run  •  [ESC/Back] Return' })
    );
  }

  return null;
}
