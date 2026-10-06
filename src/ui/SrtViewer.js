import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import fs from 'fs';
import path from 'path';
import { readSrtFile } from '../core/srt.js';
import { FooterBar } from './GlowingIndicator.js';

export function SrtViewer({ srtPath, onBack }) {
  const cues = readSrtFile(srtPath) || [];
  const [page, setPage] = useState(0);
  const pageSize = 4; // Compact 4 cues per page to stay well within standard terminal viewport (prevents scroll stacking)
  const totalPages = Math.max(1, Math.ceil(cues.length / pageSize));

  // Inline action buttons: [Previous Page] [Next Page] [Back to File Manager]
  const [selectedBtn, setSelectedBtn] = useState(1); // Default to 'Next Page' or 'Back'

  const h = React.createElement;
  const currentCues = cues.slice(page * pageSize, (page + 1) * pageSize);

  // Check for bilingual pairing
  const isMyanmarFile = path.basename(srtPath).toLowerCase().includes('_my.srt');
  const enCounterpart = isMyanmarFile
    ? path.join(path.dirname(srtPath), path.basename(srtPath).replace(/_my\.srt$/i, '.srt'))
    : null;
  const hasEnCounterpart = Boolean(enCounterpart && fs.existsSync(enCounterpart));
  const enCues = hasEnCounterpart ? readSrtFile(enCounterpart) : [];

  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  const actions = [
    {
      id: 'prev',
      label: '◀ Previous',
      disabled: !canPrev,
      action: () => {
        if (canPrev) setPage(p => p - 1);
      },
    },
    {
      id: 'next',
      label: 'Next ▶',
      disabled: !canNext,
      action: () => {
        if (canNext) setPage(p => p + 1);
      },
    },
    {
      id: 'back',
      label: 'Back to File Manager',
      disabled: false,
      action: () => onBack(),
    },
  ];

  // Keyboard navigation for inline buttons and direct hotkeys
  useInput((input, key) => {
    if (key.escape || input === 'b' || input === 'B') {
      onBack();
      return;
    }

    if (input === 'n' || input === 'N' || key.pageDown) {
      if (canNext) setPage(p => p + 1);
      return;
    }

    if (input === 'p' || input === 'P' || key.pageUp) {
      if (canPrev) setPage(p => p - 1);
      return;
    }

    if (key.leftArrow || key.upArrow) {
      setSelectedBtn(curr => (curr - 1 + actions.length) % actions.length);
      return;
    }

    if (key.rightArrow || key.downArrow || key.tab) {
      setSelectedBtn(curr => (curr + 1) % actions.length);
      return;
    }

    if (key.return) {
      const active = actions[selectedBtn];
      if (active && !active.disabled) {
        active.action();
      }
    }
  });

  return h(
    Box,
    { flexDirection: 'column' },
    h(
      Box,
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', paddingX: 1, paddingY: 0 },
      // Header with Title & Page Counter
      h(
        Box,
        { justifyContent: 'space-between', marginBottom: 1 },
        h(
          Box,
          null,
          h(Text, { bold: true, color: 'cyan' }, `Subtitles: ${path.basename(srtPath)} `),
          hasEnCounterpart ? h(Text, { color: 'greenBright', bold: true }, '[Dual EN/MY View]') : null
        ),
        h(Text, { color: 'gray' }, `Page ${page + 1} of ${totalPages} (${cues.length} cues)`)
      ),

      // Compact Subtitle Cues (4 per page)
      h(
        Box,
        { flexDirection: 'column', marginBottom: 1 },
        currentCues.map((c, i) => {
          const globalIdx = page * pageSize + i;
          const cleanText = (c.text || '').replace(/\r?\n/g, ' ').trim();
          const pairedEn = hasEnCounterpart && enCues[globalIdx] ? (enCues[globalIdx].text || '').replace(/\r?\n/g, ' ').trim() : null;

          return h(
            Box,
            { key: c.index || i, flexDirection: 'column', marginBottom: 1 },
            h(
              Box,
              null,
              h(Text, { color: 'cyanBright', bold: true }, `#${c.index} `),
              h(Text, { color: 'gray' }, `[${c.start} -> ${c.end}]`)
            ),
            pairedEn
              ? h(
                  Box,
                  null,
                  h(Text, { color: 'greenBright', bold: true }, '  EN: '),
                  h(Text, { color: 'white' }, pairedEn)
                )
              : null,
            h(
              Box,
              null,
              h(Text, { color: isMyanmarFile ? 'magentaBright' : 'gray', bold: true }, isMyanmarFile ? '  MY: ' : '  TXT: '),
              h(Text, { color: isMyanmarFile ? 'yellowBright' : 'white' }, cleanText)
            )
          );
        })
      ),

      // Horizontal Inline Action Buttons
      h(
        Box,
        { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 0, marginBottom: 0 },
        actions.map((act, idx) => {
          const isSelected = selectedBtn === idx;
          let labelColor = isSelected ? 'cyanBright' : 'white';
          if (act.disabled) {
            labelColor = 'gray';
          }

          return h(
            Box,
            { key: act.id, marginRight: 2 },
            h(
              Text,
              {
                color: labelColor,
                bold: isSelected,
              },
              isSelected ? `▶ [ ${act.label} ]` : `  [ ${act.label} ]`
            )
          );
        })
      )
    ),
    h(FooterBar, { hints: '[←/→] Select Action  •  [ENTER] Execute  •  [N] Next  •  [P] Prev  •  [ESC/B] Back' })
  );
}
