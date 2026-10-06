import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import fs from 'fs';
import path from 'path';
import { scanDirectoryForVideos, deleteSubtitleFiles } from '../core/fileScanner.js';
import { GlowingIndicator, GlowingItem, FooterBar } from './GlowingIndicator.js';

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function VideoRowItem({ isSelected = false, label, value }) {
  const h = React.createElement;

  // Handle action buttons (Refresh / Back)
  if (!value || typeof value !== 'object' || !value.fileName) {
    return h(
      Box,
      { minHeight: 1 },
      h(Text, { color: isSelected ? 'cyanBright' : 'white', bold: isSelected }, label)
    );
  }

  const v = value;
  const enText = v.hasEnSrt ? '[EN: READY]' : '[EN: --   ]';
  const myText = v.hasMySrt ? '[MY: READY]' : '[MY: --   ]';
  const outText = v.hasOutputVideo ? '[SUBTITLED]' : '[RAW VIDEO]';

  return h(
    Box,
    { flexDirection: 'row' },
    h(
      Box,
      { width: 28 },
      h(Text, { color: isSelected ? 'cyanBright' : 'white', bold: isSelected }, v.fileName)
    ),
    h(
      Box,
      { width: 16 },
      h(Text, { color: v.hasEnSrt ? 'greenBright' : 'gray', bold: v.hasEnSrt }, enText)
    ),
    h(
      Box,
      { width: 16 },
      h(Text, { color: v.hasMySrt ? 'magentaBright' : 'gray', bold: v.hasMySrt }, myText)
    ),
    h(
      Box,
      { width: 14 },
      h(Text, { color: v.hasOutputVideo ? 'cyanBright' : 'gray', bold: v.hasOutputVideo }, outText)
    )
  );
}

export function FileManagerView({ onSelectVideoForWorkflow, onViewSrt, onBack }) {
  const [videos, setVideos] = useState(() => scanDirectoryForVideos());
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [highlightedVideo, setHighlightedVideo] = useState(() => (videos.length > 0 ? videos[0] : null));
  const [message, setMessage] = useState('');

  const h = React.createElement;

  const refreshList = () => {
    const list = scanDirectoryForVideos();
    setVideos(list);
    if (list.length > 0) setHighlightedVideo(list[0]);
  };

  // If a video has been selected from the list, show the action submenu
  if (selectedVideo) {
    const actionItems = [
      {
        label: `Process with Magic Mode`,
        value: 'magic',
      },
      {
        label: `Process with Manual Planner`,
        value: 'manual',
      },
    ];

    if (selectedVideo.hasEnSrt) {
      actionItems.push({
        label: `Preview English Subtitles (${selectedVideo.baseName}.srt)`,
        value: 'view_en',
      });
    }

    if (selectedVideo.hasMySrt) {
      actionItems.push({
        label: `Preview Myanmar Subtitles (${selectedVideo.baseName}_my.srt)`,
        value: 'view_my',
      });
    }

    if (selectedVideo.hasEnSrt || selectedVideo.hasMySrt) {
      actionItems.push({
        label: `Delete Subtitle Files (.srt / _my.srt)`,
        value: 'delete',
      });
    }

    actionItems.push({
      label: `Back to Video List`,
      value: 'back_list',
    });

    const handleActionSelect = item => {
      if (item.value === 'magic') {
        onSelectVideoForWorkflow(selectedVideo, 'magic');
      } else if (item.value === 'manual') {
        onSelectVideoForWorkflow(selectedVideo, 'manual');
      } else if (item.value === 'view_en') {
        onViewSrt(selectedVideo.enSrtPath);
      } else if (item.value === 'view_my') {
        onViewSrt(selectedVideo.mySrtPath);
      } else if (item.value === 'delete') {
        const deleted = deleteSubtitleFiles(selectedVideo);
        setMessage(`Deleted: ${deleted.length} subtitle file(s).`);
        refreshList();
        setSelectedVideo(null);
      } else if (item.value === 'back_list') {
        setSelectedVideo(null);
        setMessage('');
      }
    };

    return h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
        h(Text, { bold: true, color: 'white', marginBottom: 1 }, `Selected Video: ${selectedVideo.fileName}`),
        h(
          Box,
          { marginBottom: 1 },
          h(Text, { color: selectedVideo.hasEnSrt ? 'greenBright' : 'gray', bold: selectedVideo.hasEnSrt }, selectedVideo.hasEnSrt ? '[EN: READY] ' : '[EN: --   ] '),
          h(Text, { color: selectedVideo.hasMySrt ? 'magentaBright' : 'gray', bold: selectedVideo.hasMySrt }, selectedVideo.hasMySrt ? '[MY: READY] ' : '[MY: --   ] '),
          h(Text, { color: selectedVideo.hasOutputVideo ? 'cyanBright' : 'gray', bold: selectedVideo.hasOutputVideo }, selectedVideo.hasOutputVideo ? '[SUBTITLED]' : '[RAW VIDEO]')
        ),
        h(SelectInput, { items: actionItems, indicatorComponent: GlowingIndicator, itemComponent: GlowingItem, onSelect: handleActionSelect })
      ),
      h(FooterBar, { hints: '[↑/↓] Navigate  •  [ENTER] Execute Action  •  [ESC/Back] Video List' })
    );
  }

  // Primary video list
  const listItems = videos.map(v => {
    return {
      key: `video_${v.fileName}`,
      label: v.fileName,
      value: v,
    };
  });

  listItems.push({
    key: 'action_refresh',
    label: 'Refresh File List',
    value: 'refresh',
  });

  listItems.push({
    key: 'action_back',
    label: 'Back to Main Menu',
    value: 'back',
  });

  const handleVideoSelect = item => {
    if (item.value === 'back') {
      onBack();
    } else if (item.value === 'refresh') {
      refreshList();
    } else {
      setSelectedVideo(item.value);
    }
  };

  // Compute live inspector metadata for currently highlighted item
  let infoLine = null;
  if (highlightedVideo && typeof highlightedVideo === 'object' && highlightedVideo.fullPath) {
    let fileSizeStr = '';
    try {
      const stats = fs.statSync(highlightedVideo.fullPath);
      fileSizeStr = formatFileSize(stats.size);
    } catch {}

    let statusDesc = 'Raw Video (Needs Whisper Transcription)';
    if (highlightedVideo.hasEnSrt && highlightedVideo.hasMySrt && highlightedVideo.hasOutputVideo) {
      statusDesc = 'Fully Subtitled & Rendered';
    } else if (highlightedVideo.hasEnSrt && highlightedVideo.hasMySrt) {
      statusDesc = 'Subtitles Ready (Render Pending)';
    } else if (highlightedVideo.hasEnSrt) {
      statusDesc = 'English Ready (Needs Myanmar Translation)';
    }

    infoLine = `${highlightedVideo.fileName} • ${fileSizeStr} • ${statusDesc}`;
  }

  return h(
    Box,
    { flexDirection: 'column' },
    h(
      Box,
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
      h(Text, { bold: true, color: 'cyan', marginBottom: 1 }, 'File Manager & Subtitle Status Dashboard:'),
      message ? h(Text, { color: 'yellowBright', marginBottom: 1 }, message) : null,
      h(
        Box,
        { flexDirection: 'row', marginBottom: 1 },
        // Offset 2 characters for indicator column
        h(Box, { width: 2 }, h(Text, null, ' ')),
        h(Box, { width: 28 }, h(Text, { color: 'gray', bold: true }, 'Video File')),
        h(Box, { width: 16 }, h(Text, { color: 'greenBright', bold: true }, 'English')),
        h(Box, { width: 16 }, h(Text, { color: 'magentaBright', bold: true }, 'Myanmar')),
        h(Box, { width: 14 }, h(Text, { color: 'cyanBright', bold: true }, 'Output Video'))
      ),
      h(SelectInput, {
        items: listItems,
        indicatorComponent: GlowingIndicator,
        itemComponent: VideoRowItem,
        onHighlight: item => {
          if (item?.value && typeof item.value === 'object') {
            setHighlightedVideo(item.value);
          }
        },
        onSelect: handleVideoSelect,
      }),
      infoLine
        ? h(
            Box,
            { marginTop: 1, borderStyle: 'single', borderColor: 'gray', paddingX: 1 },
            h(Text, { color: 'cyanBright', bold: true }, 'Selected: '),
            h(Text, { color: 'white' }, infoLine)
          )
        : null
    ),
    h(FooterBar, { hints: '[↑/↓] Browse Files  •  [ENTER] Inspect Video  •  [Ctrl+C] Quit' })
  );
}
