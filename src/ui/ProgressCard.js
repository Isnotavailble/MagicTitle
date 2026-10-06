import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export function ProgressCard({ jobState }) {
  const { steps, currentStepIndex, activeMessage, provider, elapsedTime } = jobState;
  const h = React.createElement;

  return h(
    Box,
    { flexDirection: 'column', marginTop: 1 },

    // Dynamic Active Status Card (Only live region below Static)
    h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: 'cyan',
        padding: 1,
        marginBottom: 1,
      },
      h(
        Box,
        { justifyContent: 'space-between', marginBottom: 1 },
        h(Text, { bold: true, color: 'cyan' }, 'Active Pipeline Execution'),
        h(
          Box,
          null,
          h(Text, { color: 'gray' }, 'Elapsed: '),
          h(Text, { color: 'yellow', bold: true }, elapsedTime || '0s'),
          h(Text, { color: 'gray' }, '  |  Provider: '),
          h(Text, { color: provider === 'groq' ? 'yellowBright' : 'magentaBright', bold: true }, provider.toUpperCase())
        )
      ),
      h(
        Box,
        { flexDirection: 'column' },
        steps.map((step, idx) => {
          let icon;
          let color = 'gray';

          if (idx < currentStepIndex) {
            icon = h(Text, { color: 'green', bold: true }, '✓ ');
            color = 'green';
          } else if (idx === currentStepIndex) {
            icon = h(
              Text,
              { color: 'cyan', bold: true },
              h(Spinner, { type: 'dots' }),
              ' '
            );
            color = 'cyan';
          } else {
            icon = h(Text, { color: 'gray' }, '○ ');
            color = 'gray';
          }

          return h(
            Box,
            { key: idx, marginBottom: 0 },
            icon,
            h(
              Text,
              { color, bold: idx === currentStepIndex },
              `[${idx + 1}/${steps.length}] ${step.title}`
            )
          );
        })
      )
    ),

    // Active bottom status line
    activeMessage
      ? h(
          Box,
          { borderStyle: 'single', borderColor: 'cyan', paddingX: 1 },
          h(Text, { color: 'cyan', bold: true }, 'Status: '),
          h(Text, { color: 'yellow' }, activeMessage)
        )
      : null
  );
}
