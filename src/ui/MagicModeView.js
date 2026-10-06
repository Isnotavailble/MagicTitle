import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { scanDirectoryForVideos } from '../core/fileScanner.js';
import { GlowingIndicator, GlowingItem, VideoPickerItem, FooterBar } from './GlowingIndicator.js';
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
      label: v.fileName,
      value: v,
    }));
    items.push({ key: 'action_back', label: 'Back to Main Menu', value: 'back' });

    return h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
        h(Text, { bold: true, color: 'cyan', marginBottom: 1 }, 'Magic Mode - Select Target Video:'),
        h(SelectInput, {
          items,
          indicatorComponent: GlowingIndicator,
          itemComponent: VideoPickerItem,
          onSelect: item => {
            if (item.value === 'back') onBack();
            else {
              setVideo(item.value);
              setStep('workflow');
            }
          },
        })
      ),
      h(FooterBar, { hints: '[↑/↓] Choose Video  •  [ENTER] Select Workflow  •  [Ctrl+C] Quit' })
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
        label: 'Back',
        value: 'back',
      },
    ];

    return h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
        h(
          Box,
          { marginBottom: 1 },
          h(Text, { bold: true, color: 'white' }, `Selected Video: ${video.fileName} `),
          h(Text, { color: video.hasEnSrt ? 'greenBright' : 'gray', bold: video.hasEnSrt }, video.hasEnSrt ? '[EN: READY]' : '[EN: --   ]')
        ),
        h(Text, { color: 'cyan', marginBottom: 1 }, 'Choose Subtitle Workflow:'),
        h(SelectInput, {
          items,
          indicatorComponent: GlowingIndicator,
          itemComponent: GlowingItem,
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
      ),
      h(FooterBar, { hints: '[↑/↓] Select Language  •  [ENTER] Continue  •  [ESC/Back] Video Select' })
    );
  }

  // STEP 3: Smart SRT Reuse Prompt
  if (step === 'reuse_prompt') {
    const items = [
      {
        label: `Yes, reuse existing SRT (${video.baseName}.srt) [Saves 5-10 mins!]`,
        value: true,
      },
      {
        label: `No, re-extract and transcribe from scratch with Whisper`,
        value: false,
      },
      {
        label: 'Back',
        value: 'back',
      },
    ];

    return h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        { flexDirection: 'column', borderStyle: 'round', borderColor: 'yellow', padding: 1 },
        h(Text, { bold: true, color: 'yellow', marginBottom: 1 }, 'Smart SRT Detection:'),
        h(
          Text,
          { color: 'white', marginBottom: 1 },
          `An existing English subtitle was found at "${video.baseName}.srt". Would you like to reuse it?`
        ),
        h(SelectInput, {
          items,
          indicatorComponent: GlowingIndicator,
          itemComponent: GlowingItem,
          onSelect: item => {
            if (item.value === 'back') setStep('workflow');
            else {
              setReuseSrt(item.value);
              setStep('burn_mode');
            }
          },
        })
      ),
      h(FooterBar, { hints: '[↑/↓] Choose Option  •  [ENTER] Confirm  •  [ESC/Back] Previous' })
    );
  }

  // STEP 4: Choose Output Muxing Mode (Soft vs Hard Burn)
  if (step === 'burn_mode') {
    const items = [
      {
        label: 'Soft Mux (Fast, embeds selectable subtitle track via mov_text)',
        value: false,
      },
      {
        label: 'Hard Burn (Renders permanent subtitles into video pixels with Padauk & HarfBuzz)',
        value: true,
      },
      {
        label: 'Back',
        value: 'back',
      },
    ];

    return h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
        h(Text, { bold: true, color: 'cyan', marginBottom: 1 }, 'Select Video Rendering Mode:'),
        h(SelectInput, {
          items,
          indicatorComponent: GlowingIndicator,
          itemComponent: GlowingItem,
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
      ),
      h(FooterBar, { hints: '[↑/↓] Choose Output Mode  •  [ENTER] Launch Pipeline Job' })
    );
  }

  return null;
}
