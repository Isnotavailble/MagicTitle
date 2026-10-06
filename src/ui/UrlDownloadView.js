import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { validateVideoUrl, downloadVideo } from '../core/downloader.js';
import { ProgressBar } from './ProgressBar.js';
import { FooterBar } from './GlowingIndicator.js';

export function UrlDownloadView({ onVideoReady, onBack }) {
  const [url, setUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [progressData, setProgressData] = useState({
    percent: 0,
    speed: '',
    eta: '',
    totalSize: '',
    statusText: '',
  });
  const [latestLog, setLatestLog] = useState('');

  const h = React.createElement;

  // Handle ESC when not actively downloading
  useInput((input, key) => {
    if (key.escape && !isDownloading) {
      onBack();
    }
  });

  const handleSubmit = async rawValue => {
    if (isDownloading) return;
    setErrorMsg('');

    const validation = validateVideoUrl(rawValue);
    if (!validation.isValid) {
      setErrorMsg(validation.error);
      return;
    }

    setIsDownloading(true);
    setProgressData({
      percent: 0,
      speed: '',
      eta: '',
      totalSize: '',
      statusText: 'Initializing yt-dlp...',
    });
    setLatestLog('Connecting to video host...');

    try {
      const videoEntry = await downloadVideo(validation.sanitizedUrl, {
        onProgress: prog => {
          setProgressData(prog);
        },
        onLog: logMsg => {
          setLatestLog(logMsg);
        },
      });

      // Brief delay on 100% to let the user see completion before continuing
      setTimeout(() => {
        onVideoReady(videoEntry);
      }, 500);
    } catch (err) {
      setIsDownloading(false);
      setErrorMsg(err.message || 'Download failed.');
    }
  };

  if (isDownloading) {
    return h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
        h(
          Box,
          { marginBottom: 1 },
          h(Text, { color: 'cyanBright' }, h(Spinner, { type: 'dots' })),
          h(Text, { bold: true, color: 'cyan', marginLeft: 1 }, 'Downloading Video with yt-dlp...')
        ),
        h(
          Box,
          { marginBottom: 1 },
          h(ProgressBar, { percent: progressData.percent, width: 34, color: 'cyanBright' })
        ),
        progressData.speed || progressData.eta || progressData.totalSize
          ? h(
              Box,
              { marginBottom: 1 },
              progressData.totalSize ? h(Text, { color: 'white' }, `Size: ${progressData.totalSize}  •  `) : null,
              progressData.speed ? h(Text, { color: 'greenBright' }, `Speed: ${progressData.speed}  •  `) : null,
              progressData.eta ? h(Text, { color: 'yellowBright' }, `ETA: ${progressData.eta}`) : null
            )
          : null,
        latestLog
          ? h(
              Box,
              null,
              h(Text, { color: 'gray' }, '> '),
              h(Text, { color: 'gray' }, latestLog)
            )
          : null
      ),
      h(FooterBar, { hints: 'Downloading in progress... Please wait while yt-dlp fetches and merges streams.' })
    );
  }

  return h(
    Box,
    { flexDirection: 'column' },
    h(
      Box,
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
      h(Text, { bold: true, color: 'cyan', marginBottom: 1 }, 'Download Target Video from URL:'),
      h(
        Text,
        { color: 'white', marginBottom: 1 },
        'Paste YouTube, TikTok, Facebook, Twitter/X, or any direct video link:'
      ),
      h(
        Box,
        { borderStyle: 'single', borderColor: 'gray', paddingX: 1, marginBottom: errorMsg ? 1 : 0 },
        h(Text, { color: 'cyanBright', bold: true }, '> '),
        h(TextInput, {
          value: url,
          onChange: setUrl,
          onSubmit: handleSubmit,
          placeholder: 'https://www.youtube.com/watch?v=...',
        })
      ),
      errorMsg
        ? h(
            Box,
            { marginTop: 1 },
            h(Text, { color: 'redBright', bold: true }, '[ERROR] '),
            h(Text, { color: 'red' }, errorMsg)
          )
        : null
    ),
    h(FooterBar, { hints: '[ENTER] Validate & Download  •  [ESC] Cancel / Return' })
  );
}
