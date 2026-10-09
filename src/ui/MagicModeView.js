import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { scanDirectoryForVideos } from '../core/fileScanner.js';
import { GlowingIndicator, GlowingItem, VideoPickerItem, FooterBar } from './GlowingIndicator.js';
import { UrlDownloadView } from './UrlDownloadView.js';

export function MagicModeView({ preselectedVideo, onStartJob, onBack }) {
  const [step, setStep] = useState(preselectedVideo ? 'workflow' : 'select_video');
  const [video, setVideo] = useState(preselectedVideo || null);
  const [workflow, setWorkflow] = useState(null); // 'english' or 'myanmar'
  const [language, setLanguage] = useState('en'); // 'en', 'auto'
  const [reuseSrt, setReuseSrt] = useState(false);
  const [reuseMySrt, setReuseMySrt] = useState(false);
  const [useProbe, setUseProbe] = useState(true);
  const [usePrompt, setUsePrompt] = useState(true);
  const [burnMode, setBurnMode] = useState(false); // false = soft mux, true = hard burn

  const h = React.createElement;
  const videos = scanDirectoryForVideos();

  // STEP 0: Download from URL
  if (step === 'download_url') {
    return h(UrlDownloadView, {
      onVideoReady: downloadedVideo => {
        setVideo(downloadedVideo);
        setStep('workflow');
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
        h(Text, { bold: true, color: 'cyan', marginBottom: 1 }, 'Magic Mode - Select Target Video:'),
        h(SelectInput, {
          items,
          indicatorComponent: GlowingIndicator,
          itemComponent: VideoPickerItem,
          onSelect: item => {
            if (item.value === 'back') onBack();
            else if (item.value === 'download_url') setStep('download_url');
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

  // STEP 2: Choose Workflow & Language
  if (step === 'workflow') {
    const items = [
      {
        key: 'wf_quick_en',
        label: 'Quick English Subtitles',
        value: { workflow: 'english', language: 'en' },
      },
      {
        key: 'wf_myanmar_en',
        label: 'English to Burmese Subtitles (Speech: English [Default])',
        value: { workflow: 'myanmar', language: 'en' },
      },
      {
        key: 'wf_myanmar_dynamic',
        label: 'Dynamic Language to Burmese Subtitles (Auto-detect speech)',
        value: { workflow: 'myanmar', language: 'auto' },
      },
      {
        key: 'wf_back',
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
          h(Text, { color: video.hasEnSrt ? 'greenBright' : 'gray', bold: video.hasEnSrt }, video.hasEnSrt ? '[EN: READY] ' : '[EN: --   ] '),
          h(Text, { color: video.hasMySrt ? 'magentaBright' : 'gray', bold: video.hasMySrt }, video.hasMySrt ? '[MY: READY] ' : '[MY: --   ] '),
          h(Text, { color: video.hasPrompt ? 'yellowBright' : 'gray', bold: video.hasPrompt }, video.hasPrompt ? '[PROMPT: READY]' : '[PROMPT: --   ]')
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
              const chosenWf = item.value.workflow;
              setWorkflow(chosenWf);
              setLanguage(item.value.language);
              if (chosenWf === 'myanmar' && video.hasMySrt) {
                setStep('reuse_my_prompt');
              } else if (video.hasEnSrt) {
                setStep('reuse_prompt');
              } else if (video.hasPrompt) {
                setStep('existing_prompt_choice');
              } else {
                setStep('probe_prompt');
              }
            }
          },
        })
      ),
      h(FooterBar, { hints: '[↑/↓] Select Language & Workflow  •  [ENTER] Continue  •  [ESC/Back] Video Select' })
    );
  }

  // STEP 3A: Smart Myanmar SRT Reuse Prompt
  if (step === 'reuse_my_prompt') {
    const items = [
      {
        key: 'reuse_my_opt_yes',
        label: `Yes, reuse existing Myanmar SRT (${video.baseName}_my.srt) [Skips Whisper & Translation!]`,
        value: true,
      },
      {
        key: 'reuse_my_opt_no',
        label: `No, re-translate (or transcribe from scratch)`,
        value: false,
      },
      {
        key: 'reuse_my_opt_back',
        label: 'Back',
        value: 'back',
      },
    ];

    return h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        { flexDirection: 'column', borderStyle: 'round', borderColor: 'magentaBright', padding: 1 },
        h(Text, { bold: true, color: 'magentaBright', marginBottom: 1 }, 'Smart Myanmar SRT Detection:'),
        h(
          Text,
          { color: 'white', marginBottom: 1 },
          `An existing translated Myanmar subtitle was found at "${video.baseName}_my.srt". Would you like to reuse it directly?`
        ),
        h(SelectInput, {
          items,
          indicatorComponent: GlowingIndicator,
          itemComponent: GlowingItem,
          onSelect: item => {
            if (item.value === 'back') setStep('workflow');
            else if (item.value === true) {
              setReuseMySrt(true);
              setReuseSrt(false);
              setStep('burn_mode');
            } else {
              setReuseMySrt(false);
              if (video.hasEnSrt) {
                setStep('reuse_prompt');
              } else if (video.hasPrompt) {
                setStep('existing_prompt_choice');
              } else {
                setStep('probe_prompt');
              }
            }
          },
        })
      ),
      h(FooterBar, { hints: '[↑/↓] Choose Option  •  [ENTER] Confirm  •  [ESC/Back] Previous' })
    );
  }

  // STEP 3B: Smart English SRT Reuse Prompt
  if (step === 'reuse_prompt') {
    const items = [
      {
        key: 'reuse_opt_yes',
        label: `Yes, reuse existing English SRT (${video.baseName}.srt) [Saves 5-10 mins!]`,
        value: true,
      },
      {
        key: 'reuse_opt_no',
        label: `No, re-extract and transcribe from scratch with Whisper`,
        value: false,
      },
      {
        key: 'reuse_opt_back',
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
            if (item.value === 'back') {
              if (workflow === 'myanmar' && video.hasMySrt) setStep('reuse_my_prompt');
              else setStep('workflow');
            } else if (item.value === true) {
              setReuseSrt(true);
              setReuseMySrt(false);
              setStep('burn_mode');
            } else {
              setReuseSrt(false);
              setReuseMySrt(false);
              if (video.hasPrompt) {
                setStep('existing_prompt_choice');
              } else {
                setStep('probe_prompt');
              }
            }
          },
        })
      ),
      h(FooterBar, { hints: '[↑/↓] Choose Option  •  [ENTER] Confirm  •  [ESC/Back] Previous' })
    );
  }

  // STEP 3.4: Existing Dynamic Prompt Choice
  if (step === 'existing_prompt_choice') {
    const items = [
      {
        key: 'prompt_opt_reuse',
        label: `Yes, reuse existing prompt (${video.baseName}_prompt.txt) [Skips probe pass]`,
        value: 'reuse',
      },
      {
        key: 'prompt_opt_reprobe',
        label: 'No, re-run fresh tiny.en probe to regenerate vocabulary',
        value: 'reprobe',
      },
      {
        key: 'prompt_opt_skip',
        label: 'Skip entirely (No prompt, transcribe with raw unconditioned audio context)',
        value: 'skip',
      },
      {
        key: 'prompt_opt_back',
        label: 'Back',
        value: 'back',
      },
    ];

    return h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        { flexDirection: 'column', borderStyle: 'round', borderColor: 'yellowBright', padding: 1 },
        h(Text, { bold: true, color: 'yellowBright', marginBottom: 1 }, 'Existing Dynamic Prompt Detected:'),
        h(
          Text,
          { color: 'white', marginBottom: 1 },
          `A saved vocabulary prompt was found at "${video.baseName}_prompt.txt". Would you like to reuse it, re-run probe, or skip entirely?`
        ),
        h(SelectInput, {
          items,
          indicatorComponent: GlowingIndicator,
          itemComponent: GlowingItem,
          onSelect: item => {
            if (item.value === 'back') {
              if (video.hasEnSrt) setStep('reuse_prompt');
              else if (workflow === 'myanmar' && video.hasMySrt) setStep('reuse_my_prompt');
              else setStep('workflow');
            } else if (item.value === 'reuse') {
              setUseProbe(false);
              setUsePrompt(true);
              setStep('burn_mode');
            } else if (item.value === 'reprobe') {
              setUseProbe(true);
              setUsePrompt(true);
              setStep('burn_mode');
            } else if (item.value === 'skip') {
              setUseProbe(false);
              setUsePrompt(false);
              setStep('burn_mode');
            }
          },
        })
      ),
      h(FooterBar, { hints: '[↑/↓] Choose Option  •  [ENTER] Confirm  •  [ESC/Back] Previous' })
    );
  }

  // STEP 3.5: Pre-process with tiny.en? Prompt
  if (step === 'probe_prompt') {
    const items = [
      {
        key: 'probe_opt_yes',
        label: 'Yes, pre-process with tiny.en (Recommended: Harvests keywords for maximum accuracy)',
        value: true,
      },
      {
        key: 'probe_opt_no',
        label: 'No, skip pre-processing and transcribe with clean audio context (No prompt)',
        value: false,
      },
      {
        key: 'probe_opt_back',
        label: 'Back',
        value: 'back',
      },
    ];

    return h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        { flexDirection: 'column', borderStyle: 'round', borderColor: 'greenBright', padding: 1 },
        h(Text, { bold: true, color: 'greenBright', marginBottom: 1 }, 'Dynamic Keyword Probe:'),
        h(
          Text,
          { color: 'white', marginBottom: 1 },
          'Pre-process with tiny.en? (Runs a fast probe to harvest domain vocabulary & proper names for small.en)'
        ),
        h(SelectInput, {
          items,
          indicatorComponent: GlowingIndicator,
          itemComponent: GlowingItem,
          onSelect: item => {
            if (item.value === 'back') {
              setStep(video.hasEnSrt ? 'reuse_prompt' : 'workflow');
            } else if (item.value === true) {
              setUseProbe(true);
              setUsePrompt(true);
              setStep('burn_mode');
            } else {
              setUseProbe(false);
              setUsePrompt(false);
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
        key: 'burn_opt_soft',
        label: 'Soft Mux (Fast, embeds selectable subtitle track via mov_text)',
        value: false,
      },
      {
        key: 'burn_opt_hard',
        label: 'Hard Burn (Renders permanent subtitles into video pixels with Padauk & HarfBuzz)',
        value: true,
      },
      {
        key: 'burn_opt_back',
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
            if (item.value === 'back') {
              if (reuseMySrt) setStep('reuse_my_prompt');
              else if (reuseSrt) setStep('reuse_prompt');
              else if (video.hasPrompt) setStep('existing_prompt_choice');
              else setStep('probe_prompt');
            } else {
              setBurnMode(item.value);
              // Ready to run!
              onStartJob({
                video,
                workflow,
                language,
                reuseSrt,
                reuseMySrt,
                useProbe,
                usePrompt,
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
