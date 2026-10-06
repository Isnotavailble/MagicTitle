import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { GlowingIndicator, GlowingItem } from './GlowingIndicator.js';

export function ResultCard({ result, onDone }) {
  const h = React.createElement;

  const items = [
    { key: 'action_menu', label: 'Return to Main Menu', value: 'menu' },
    { key: 'action_file_manager', label: 'Go to File Manager', value: 'fileManager' },
  ];

  return h(
    Box,
    { flexDirection: 'column', marginTop: 1 },

    // Result Summary Card
    h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: result.success ? 'green' : 'red',
        padding: 1,
        marginBottom: 1,
      },
      h(
        Box,
        { justifyContent: 'space-between', marginBottom: 1 },
        h(
          Text,
          { bold: true, color: result.success ? 'green' : 'red' },
          result.success ? 'MagicTitle Pipeline Completed Successfully!' : 'Pipeline Failed'
        ),
        result.success
          ? h(
              Box,
              null,
              result.cueCount ? h(Text, { color: 'gray' }, `Cues: ${result.cueCount}  |  `) : null,
              h(Text, { color: 'yellow', bold: true }, `Duration: ${result.duration}`)
            )
          : null
      ),
      result.success
        ? h(
            Box,
            { flexDirection: 'column' },
            result.outputVideo
              ? h(
                  Box,
                  { marginBottom: 0 },
                  h(Text, { color: 'cyan', bold: true }, 'Video Output:  '),
                  h(Text, { color: 'white' }, result.outputVideo)
                )
              : null,
            result.srtFile
              ? h(
                  Box,
                  { marginBottom: 0 },
                  h(Text, { color: 'magenta', bold: true }, 'Subtitle File: '),
                  h(Text, { color: 'white' }, result.srtFile)
                )
              : null
          )
        : h(
            Box,
            { flexDirection: 'column' },
            h(Text, { color: 'red' }, result.error || 'An unknown error occurred.')
          )
    ),

    // Actions Menu
    h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: 'cyan',
        padding: 1,
      },
      h(Text, { color: 'cyan', bold: true, marginBottom: 1 }, 'Next Action:'),
      h(SelectInput, { items, indicatorComponent: GlowingIndicator, itemComponent: GlowingItem, onSelect: item => onDone(item.value) })
    )
  );
}
