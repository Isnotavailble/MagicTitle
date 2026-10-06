import React from 'react';
import { Box, Text } from 'ink';
import path from 'path';
import gradient from 'gradient-string';
import { resolvePaths } from '../core/paths.js';
import { CONFIG } from '../config.js';

const geminiGradient = gradient(['#4FACFE', '#00F2FE', '#6B5B95', '#B06AB3']);

const ASCII_LOGO = `
 ███╗   ███╗ █████╗  ██████╗ ██╗ ██████╗████████╗██╗████████╗██╗     ███████╗
 ████╗ ████║██╔══██╗██╔════╝ ██║██╔════╝╚══██╔══╝██║╚══██╔══╝██║     ██╔════╝
 ██╔████╔██║███████║██║  ███╗██║██║        ██║   ██║   ██║   ██║     █████╗  
 ██║╚██╔╝██║██╔══██║██║   ██║██║██║        ██║   ██║   ██║   ██║     ██╔══╝  
 ██║ ╚═╝ ██║██║  ██║╚██████╔╝██║╚██████╗   ██║   ██║   ██║   ███████╗███████╗
 ╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝ ╚═════╝   ╚═╝   ╚═╝   ╚═╝   ╚══════╝╚══════╝
`;

export function printStartupBanner() {
  process.stdout.write(geminiGradient(ASCII_LOGO) + '\n');
  process.stdout.write(' \x1b[36m\x1b[1m✦ AI Film Subtitling & Myanmar Unicode Engine ✦\x1b[0m  \x1b[90m[v1.0.0]\x1b[0m\n\n');
}

export function Banner() {
  const h = React.createElement;

  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1, paddingX: 1 },
    h(Text, null, geminiGradient(ASCII_LOGO)),
    h(
      Box,
      { marginTop: -1, marginBottom: 0 },
      h(Text, { bold: true, color: 'cyan' }, '✦ AI Film Subtitling & Myanmar Unicode Engine ✦  '),
      h(Text, { color: 'gray' }, '[v1.0.0]')
    )
  );
}

export function StatusBar({ currentProvider }) {
  const { modelFile, hasModel } = resolvePaths();
  const provider = currentProvider || CONFIG.defaultService;
  const modelName = modelFile ? path.basename(modelFile, '.bin').replace(/^ggml-/, '') : 'Not Found';

  const h = React.createElement;

  return h(
    Box,
    {
      borderStyle: 'round',
      borderColor: 'cyan',
      paddingX: 2,
      marginBottom: 1,
      justifyContent: 'space-between',
    },
    h(
      Box,
      null,
      h(Text, { bold: true, color: 'cyan' }, 'AI Provider: '),
      h(
        Text,
        { color: provider === 'groq' ? 'yellowBright' : 'magentaBright', bold: true },
        provider === 'groq' ? '⚡ Groq (Qwen 3.8)' : '✦ Google Gemini (3.5 Flash Lite)'
      )
    ),
    h(
      Box,
      null,
      h(Text, { color: hasModel ? 'green' : 'red', bold: true }, hasModel ? '● ' : '○ '),
      h(Text, { color: 'cyan', bold: true }, 'Whisper: '),
      h(Text, { color: hasModel ? 'greenBright' : 'red', bold: true }, modelName)
    )
  );
}
