import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { scanDirectoryForVideos, deleteSubtitleFiles } from '../core/fileScanner.js';

export function FileManagerView({ onSelectVideoForWorkflow, onViewSrt, onBack }) {
  const [videos, setVideos] = useState(() => scanDirectoryForVideos());
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [message, setMessage] = useState('');

  const h = React.createElement;

  const refreshList = () => {
    const list = scanDirectoryForVideos();
    setVideos(list);
  };

  // If a video has been selected from the list, show the action submenu
  if (selectedVideo) {
    const actionItems = [
      {
        label: `⚡ Process with Magic Mode`,
        value: 'magic',
      },
      {
        label: `🛠️  Process with Manual Planner`,
        value: 'manual',
      },
    ];

    if (selectedVideo.hasEnSrt) {
      actionItems.push({
        label: `👁️ Preview English Subtitles (${selectedVideo.baseName}.srt)`,
        value: 'view_en',
      });
    }

    if (selectedVideo.hasMySrt) {
      actionItems.push({
        label: `👁️ Preview Myanmar Subtitles (${selectedVideo.baseName}_my.srt)`,
        value: 'view_my',
      });
    }

    if (selectedVideo.hasEnSrt || selectedVideo.hasMySrt) {
      actionItems.push({
        label: `🗑️  Delete Subtitle Files (.srt / _my.srt)`,
        value: 'delete',
      });
    }

    actionItems.push({
      label: `↩ Back to Video List`,
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
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
      h(Text, { bold: true, color: 'white', marginBottom: 1 }, `Selected Video: ${selectedVideo.fileName}`),
      h(
        Box,
        { marginBottom: 1 },
        h(Text, { color: selectedVideo.hasEnSrt ? 'green' : 'gray' }, selectedVideo.hasEnSrt ? '[EN ✓] ' : '[EN -] '),
        h(Text, { color: selectedVideo.hasMySrt ? 'magenta' : 'gray' }, selectedVideo.hasMySrt ? '[MY ✓] ' : '[MY -] '),
        h(Text, { color: selectedVideo.hasOutputVideo ? 'cyan' : 'gray' }, selectedVideo.hasOutputVideo ? '[SUBTITLED ✓]' : '[RAW VIDEO]')
      ),
      h(SelectInput, { items: actionItems, onSelect: handleActionSelect })
    );
  }

  // Primary video list
  const listItems = videos.map(v => {
    const enBadge = v.hasEnSrt ? '[EN ✓]' : '      ';
    const myBadge = v.hasMySrt ? '[MY ✓]' : '      ';
    const outBadge = v.hasOutputVideo ? '[SUBTITLED]' : '          ';
    return {
      key: `video_${v.fileName}`,
      label: `${v.fileName.padEnd(25)}  ${enBadge}  ${myBadge}  ${outBadge}`,
      value: v,
    };
  });

  listItems.push({
    key: 'action_refresh',
    label: '🔄 Refresh File List',
    value: 'refresh',
  });

  listItems.push({
    key: 'action_back',
    label: '↩ Back to Main Menu',
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

  return h(
    Box,
    { flexDirection: 'column', borderStyle: 'round', borderColor: 'blue', padding: 1 },
    h(Text, { bold: true, color: 'cyan', marginBottom: 1 }, '📁 File Manager & Subtitle Status Dashboard:'),
    message ? h(Text, { color: 'yellow', marginBottom: 1 }, message) : null,
    h(
      Box,
      { marginBottom: 1 },
      h(Text, { color: 'gray' }, 'Video File'.padEnd(28)),
      h(Text, { color: 'green' }, 'English   '),
      h(Text, { color: 'magenta' }, 'Myanmar   '),
      h(Text, { color: 'cyan' }, 'Output Video')
    ),
    h(SelectInput, { items: listItems, onSelect: handleVideoSelect }),
    h(
      Box,
      { marginTop: 1 },
      h(Text, { color: 'gray' }, 'Select a video to inspect, delete SRTs, or launch pipeline.')
    )
  );
}
