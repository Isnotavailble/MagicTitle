import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { GlowingIndicator, FooterBar } from './GlowingIndicator.js';

function MenuItem({ isSelected = false, label, hint }) {
  const h = React.createElement;

  return h(
    Box,
    { flexDirection: 'row' },
    h(
      Box,
      { minWidth: 26 },
      h(Text, { color: isSelected ? 'cyanBright' : 'white', bold: isSelected }, label)
    ),
    isSelected && hint
      ? h(
          Box,
          { marginLeft: 2 },
          h(Text, { color: 'gray' }, hint)
        )
      : null
  );
}

export function MainMenu({ onSelect }) {
  const h = React.createElement;

  const items = [
    {
      label: '1. Magic Mode',
      value: 'magic',
      hint: 'Instant automated pipelines (English / Myanmar)',
    },
    {
      label: '2. File Manager',
      value: 'fileManager',
      hint: 'Browse videos, subtitle badges & clean SRTs',
    },
    {
      label: '3. Manual Plan',
      value: 'manualPlanner',
      hint: 'Modular step pipeline (Audio, Transcribe, Review, Burn)',
    },
    {
      label: '4. Switch AI Provider',
      value: 'providerSelect',
      hint: 'Toggle active LLM (Google Gemini <-> Groq)',
    },
    {
      label: '5. Exit MagicTitle',
      value: 'exit',
      hint: 'Quit application cleanly',
    },
  ];

  return h(
    Box,
    { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
    h(Text, { bold: true, color: 'white', marginBottom: 1 }, 'Main Navigation Menu:'),
    h(SelectInput, {
      items,
      indicatorComponent: GlowingIndicator,
      itemComponent: MenuItem,
      onSelect: item => onSelect(item.value),
    }),
    h(FooterBar, { hints: '[↑/↓] Navigate  •  [ENTER] Select  •  [Ctrl+C] Quit' })
  );
}
