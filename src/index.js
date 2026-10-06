import React from 'react';
import { render } from 'ink';
import { App } from './app.js';
import { printStartupBanner } from './ui/Banner.js';

// Completely wipe viewport and scrollback buffer at startup for a fresh canvas
process.stdout.write('\x1b[2J\x1b[3J\x1b[H');

// Print branded ASCII banner permanently to terminal stdout once
printStartupBanner();

// Render Ink app in standard scrollable terminal mode
const appInstance = render(React.createElement(App), {
  exitOnCtrlC: true,
});

appInstance.waitUntilExit().catch((err) => {
  console.error('MagicTitle Error:', err);
});
