import React from 'react';
import { Box, Text } from 'ink';

/**
 * Reusable terminal progress bar component.
 * @param {object} props
 * @param {number} props.percent - 0 to 100
 * @param {number} [props.width=30] - Total characters width of the bar
 * @param {string} [props.color='cyanBright'] - Color of the filled portion
 */
export function ProgressBar({ percent = 0, width = 30, color = 'cyanBright' }) {
  const h = React.createElement;
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const filledChars = Math.round((clamped / 100) * width);
  const emptyChars = width - filledChars;

  const filledStr = '█'.repeat(filledChars);
  const emptyStr = '░'.repeat(emptyChars);

  return h(
    Box,
    { flexDirection: 'row' },
    h(Text, { color: 'gray' }, '['),
    h(Text, { color, bold: true }, filledStr),
    h(Text, { color: 'gray' }, emptyStr),
    h(Text, { color: 'gray' }, ']'),
    h(Text, { color: 'yellowBright', bold: true, marginLeft: 1 }, `${clamped.toFixed(1)}%`)
  );
}
