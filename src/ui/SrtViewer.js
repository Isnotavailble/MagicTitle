import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { readSrtFile } from '../core/srt.js';
import path from 'path';

export function SrtViewer({ srtPath, onBack }) {
  const cues = readSrtFile(srtPath) || [];
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(cues.length / pageSize));

  const h = React.createElement;
  const currentCues = cues.slice(page * pageSize, (page + 1) * pageSize);

  const navItems = [];
  if (page < totalPages - 1) {
    navItems.push({ label: `▶ Next Page (${page + 2}/${totalPages})`, value: 'next' });
  }
  if (page > 0) {
    navItems.push({ label: `◀ Previous Page (${page}/${totalPages})`, value: 'prev' });
  }
  navItems.push({ label: '↩ Back to File Manager', value: 'back' });

  const handleSelect = item => {
    if (item.value === 'next') setPage(p => p + 1);
    else if (item.value === 'prev') setPage(p => p - 1);
    else if (item.value === 'back') onBack();
  };

  return h(
    Box,
    { flexDirection: 'column', borderStyle: 'round', borderColor: 'yellow', paddingX: 1 },
    h(
      Box,
      { justifyContent: 'space-between', marginBottom: 1 },
      h(Text, { bold: true, color: 'yellow' }, `Subtitles: ${path.basename(srtPath)}`),
      h(Text, { color: 'gray' }, `Page ${page + 1} of ${totalPages} (${cues.length} cues)`)
    ),
    h(
      Box,
      { flexDirection: 'column', marginBottom: 1 },
      currentCues.map((c, i) => {
        const cleanText = (c.text || '').replace(/\r?\n/g, ' ').trim();
        return h(
          Box,
          { key: c.index || i, flexDirection: 'column' },
          h(
            Text,
            null,
            h(Text, { color: 'cyan', bold: true }, `#${c.index} `),
            h(Text, { color: 'gray' }, `[${c.start} ➔ ${c.end}]`)
          ),
          h(Text, { color: 'white' }, `  ${cleanText}`)
        );
      })
    ),
    h(SelectInput, { items: navItems, onSelect: handleSelect })
  );
}
