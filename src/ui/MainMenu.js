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
      key: 'menu_magic',
      label: '1. Magic Mode',
      value: 'magic',
      hint: 'Instant automated pipelines (English / Myanmar)',
    },
    {
      key: 'menu_file_manager',
      label: '2. File Manager',
      value: 'fileManager',
      hint: 'Browse videos, subtitle badges & clean SRTs',
    },
    {
      key: 'menu_manual_planner',
      label: '3. Manual Plan',
      value: 'manualPlanner',
      hint: 'Modular step pipeline (Audio, Transcribe, Review, Burn)',
    },
    {
      key: 'menu_model_manager',
      label: '4. Manage Whisper Models',
      value: 'modelManager',
      hint: 'Load into RAM, switch model or unload memory',
    },
    {
      key: 'menu_provider_select',
      label: '5. Switch AI Provider',
      value: 'providerSelect',
      hint: 'Toggle active LLM (Google Gemini <-> Groq)',
    },
    {
      key: 'menu_exit',
      label: '6. Exit MagicTitle',
      value: 'exit',
      hint: 'Quit application cleanly & unmount memory',
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
