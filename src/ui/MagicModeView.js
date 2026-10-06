import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { scanDirectoryForVideos } from '../core/fileScanner.js';
import fs from 'fs';

export function MagicModeView({ preselectedVideo, onStartJob, onBack }) {
  const [step, setStep] = useState(preselectedVideo ? 'workflow' : 'select_video');
  const [video, setVideo] = useState(preselectedVideo || null);
  const [workflow, setWorkflow] = useState(null); // 'english' or 'myanmar'
  const [reuseSrt, setReuseSrt] = useState(false);
  const [burnMode, setBurnMode] = useState(false); // false = soft mux, true = hard burn

  const h = React.createElement;
  const videos = scanDirectoryForVideos();

  // STEP 1: Select Video
  if (step === 'select_video') {
    const items = videos.map(v => ({
      key: `video_${v.fileName}`,
      label: `${v.fileName} ${v.hasEnSrt ? '[EN SRT FOUND]' : ''}`,
      value: v,
    }));
    items.push({ key: 'action_back', label: '↩ Back to Main Menu', value: 'back' });

    return h(
      Box,
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
      h(Text, { bold: true, color: 'cyan', marginBottom: 1 }, '⚡ Magic Mode - Select Target Video:'),
      h(SelectInput, {
        items,
        onSelect: item => {
          if (item.value === 'back') onBack();
          else {
            setVideo(item.value);
            setStep('workflow');
          }
        },
      })
    );
  }

  // STEP 2: Choose Workflow (English vs Myanmar)
  if (step === 'workflow') {
    const items = [
      {
        label: 'Quick English Subtitles',
        value: 'english',
      },
      {
        label: 'Extract English and translate to Burmese subtitles',
        value: 'myanmar',
      },
      {
        label: '↩ Back',
        value: 'back',
      },
    ];

    return h(
      Box,
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
      h(Text, { bold: true, color: 'white', marginBottom: 1 }, `Selected Video: ${video.fileName}`),
      h(Text, { color: 'cyan', marginBottom: 1 }, 'Choose Subtitle Workflow:'),
      h(SelectInput, {
        items,
        onSelect: item => {
          if (item.value === 'back') {
            if (preselectedVideo) onBack();
            else setStep('select_video');
          } else {
            setWorkflow(item.value);
            // Check if existing SRT exists to prompt smart reuse
            if (video.hasEnSrt) {
              setStep('reuse_prompt');
            } else {
              setStep('burn_mode');
            }
          }
        },
      })
    );
  }

  // STEP 3: Smart SRT Reuse Prompt
  if (step === 'reuse_prompt') {
    const items = [
      {
        label: `⚡ Yes, reuse existing SRT (${video.baseName}.srt) [Saves 5-10 mins!]`,
        value: true,
      },
      {
        label: `🔄 No, re-extract and transcribe from scratch with Whisper`,
        value: false,
      },
      {
        label: '↩ Back',
        value: 'back',
      },
    ];

    return h(
      Box,
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'yellow', padding: 1 },
      h(Text, { bold: true, color: 'yellow', marginBottom: 1 }, '⚡ Smart SRT Detection:'),
      h(
        Text,
        { color: 'white', marginBottom: 1 },
        `An existing English subtitle was found at "${video.baseName}.srt". Would you like to reuse it?`
      ),
      h(SelectInput, {
        items,
        onSelect: item => {
          if (item.value === 'back') setStep('workflow');
          else {
            setReuseSrt(item.value);
            setStep('burn_mode');
          }
        },
      })
    );
  }

  // STEP 4: Choose Output Muxing Mode (Soft vs Hard Burn)
  if (step === 'burn_mode') {
    const items = [
      {
        label: '⚡ Soft Mux (Fast, embeds selectable subtitle track via mov_text)',
        value: false,
      },
      {
        label: '🔥 Hard Burn (Renders permanent subtitles into video pixels with Padauk & HarfBuzz)',
        value: true,
      },
      {
        label: '↩ Back',
        value: 'back',
      },
    ];

    return h(
      Box,
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
      h(Text, { bold: true, color: 'cyan', marginBottom: 1 }, 'Select Video Rendering Mode:'),
      h(SelectInput, {
        items,
        onSelect: item => {
          if (item.value === 'back') setStep(video.hasEnSrt ? 'reuse_prompt' : 'workflow');
          else {
            setBurnMode(item.value);
            // Ready to run!
            onStartJob({
              video,
              workflow,
              reuseSrt,
              burnMode: item.value,
              modeName: 'magic',
            });
          }
        },
      })
    );
  }

  return null;
}
