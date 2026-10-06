import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { CONFIG } from '../config.js';
import { GlowingIndicator, GlowingItem, FooterBar } from './GlowingIndicator.js';

export function ProviderSelector({ currentProvider, onSelect, onBack }) {
  const h = React.createElement;

  const items = [
    {
      label: `Google Gemini (Model: ${CONFIG.gemini.model}) ${currentProvider === 'google' ? '[ACTIVE]' : ''}`,
      value: 'google',
    },
    {
      label: `Groq Cloud (Model: ${CONFIG.groq.model}) ${currentProvider === 'groq' ? '[ACTIVE]' : ''}`,
      value: 'groq',
    },
    {
      label: 'Back to Main Menu',
      value: 'back',
    },
  ];

  return h(
    Box,
    { flexDirection: 'column' },
    h(
      Box,
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
      h(Text, { bold: true, color: 'cyan', marginBottom: 1 }, 'Choose AI Translation Provider:'),
      h(SelectInput, {
        items,
        indicatorComponent: GlowingIndicator,
        itemComponent: GlowingItem,
        onSelect: item => {
          if (item.value === 'back') {
            onBack();
          } else {
            onSelect(item.value);
          }
        },
      }),
      h(
        Box,
        { marginTop: 1, flexDirection: 'column' },
        h(Text, { color: 'gray' }, 'Both providers use the unified Spoken Myanmar Unicode prompt with cue indexing.')
      )
    ),
    h(FooterBar, { hints: '[↑/↓] Select Provider  •  [ENTER] Confirm & Switch  •  [ESC/Back] Menu' })
  );
}
