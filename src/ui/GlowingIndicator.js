import React from 'react';
import { Box, Text } from 'ink';

export function GlowingIndicator({ isSelected = false }) {
  const h = React.createElement;
  return h(
    Box,
    { marginRight: 1 },
    h(
      Text,
      { color: isSelected ? 'cyanBright' : 'gray', bold: true },
      isSelected ? '▶' : ' '
    )
  );
}

export function GlowingItem({ isSelected = false, label }) {
  const h = React.createElement;
  return h(
    Text,
    { color: isSelected ? 'cyanBright' : 'white', bold: isSelected },
    label
  );
}

export function VideoPickerItem({ isSelected = false, label, value }) {
  const h = React.createElement;

  if (!value || typeof value !== 'object' || !value.fileName) {
    return h(
      Text,
      { color: isSelected ? 'cyanBright' : 'white', bold: isSelected },
      label
    );
  }

  const v = value;
  const enBadge = v.hasEnSrt ? '[EN: READY]' : '[EN: --   ]';

  return h(
    Box,
    { flexDirection: 'row' },
    h(
      Box,
      { width: 30 },
      h(Text, { color: isSelected ? 'cyanBright' : 'white', bold: isSelected }, v.fileName)
    ),
    h(
      Text,
      { color: v.hasEnSrt ? 'greenBright' : 'gray', bold: v.hasEnSrt },
      enBadge
    )
  );
}

export function FooterBar({ hints = '[↑/↓] Navigate  •  [ENTER] Select' }) {
  const h = React.createElement;
  return h(
    Box,
    { marginTop: 1, paddingX: 1 },
    h(Text, { color: 'gray' }, hints)
  );
}
