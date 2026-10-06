import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';

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
      label: '⚡ 1. Magic Mode',
      value: 'magic',
      hint: 'Instant automated pipelines (English / Myanmar)',
    },
    {
      label: '📁 2. File Manager',
      value: 'fileManager',
      hint: 'Browse videos, subtitle badges & clean SRTs',
    },
    {
      label: '🛠️  3. Manual Plan',
      value: 'manualPlanner',
      hint: 'Modular step pipeline (Audio, Transcribe, Review, Burn)',
    },
    {
      label: '🌐 4. Switch AI Provider',
      value: 'providerSelect',
      hint: 'Toggle active LLM (Google Gemini ↔ Groq)',
    },
    {
      label: '❌ 5. Exit MagicTitle',
      value: 'exit',
      hint: 'Quit application cleanly',
    },
  ];

  return h(
    Box,
    { flexDirection: 'column', borderStyle: 'single', borderColor: 'gray', padding: 1 },
    h(Text, { bold: true, color: 'white', marginBottom: 1 }, 'Main Navigation Menu:'),
    h(SelectInput, {
      items,
      itemComponent: MenuItem,
      onSelect: item => onSelect(item.value),
    }),
    h(
      Box,
      { marginTop: 1 },
      h(Text, { color: 'gray' }, 'Use [↑/↓] arrows to navigate, [ENTER] to select')
    )
  );
}
