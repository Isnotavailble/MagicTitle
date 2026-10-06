import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { GlowingIndicator, GlowingItem } from './GlowingIndicator.js';

export function PipelineRunner({ elapsedTime, isCompleted, isFailed, onDone }) {
  const h = React.createElement;

  const nextActionItems = [
    { key: 'action_menu', label: 'Return to Main Menu', value: 'menu' },
    { key: 'action_file_manager', label: 'Go to File Manager', value: 'fileManager' },
    { key: 'action_exit', label: 'Exit MagicTitle', value: 'exit' },
  ];

  // If pipeline is finished, show Next Action selector in the dynamic region
  if (isCompleted || isFailed) {
    return h(
      Box,
      { flexDirection: 'column', marginTop: 1 },
      h(Text, { color: isCompleted ? 'cyan' : 'red', bold: true, marginBottom: 1 }, 'Next Action:'),
      h(SelectInput, { items: nextActionItems, indicatorComponent: GlowingIndicator, itemComponent: GlowingItem, onSelect: item => onDone(item.value) })
    );
  }

  // While running: Compact live spinner indicator right beneath the current step's logs
  return h(
    Box,
    { marginLeft: 2, marginTop: 0 },
    h(
      Text,
      { color: 'cyan', bold: true },
      h(Spinner, { type: 'dots' }),
      ' In progress...'
    ),
    h(Text, { color: 'yellow', bold: true }, ` (${elapsedTime || '0s'})`)
  );
}
