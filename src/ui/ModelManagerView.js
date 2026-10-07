import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { getAvailableModels, isModelActive, getActiveModel, setActiveModel, deactivateModel } from '../core/modelManager.js';
import { GlowingIndicator, GlowingItem, FooterBar } from './GlowingIndicator.js';

export function ModelManagerView({ onBack, requiredWarning = false }) {
  const [models, setModels] = useState(() => getAvailableModels());
  const [statusMessage, setStatusMessage] = useState('');

  const h = React.createElement;

  const refreshModels = () => {
    setModels(getAvailableModels());
  };

  const currentActive = getActiveModel();

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    // Press 'U' to deactivate/unload from state
    if (input.toLowerCase() === 'u') {
      if (!isModelActive()) {
        setStatusMessage('No model is currently active in state.');
        return;
      }
      deactivateModel();
      refreshModels();
      setStatusMessage('Model deactivated. No model is active.');
    }
  });

  const handleSelect = (item) => {
    if (item.value === 'back') {
      onBack();
      return;
    }

    if (item.value === 'deactivate') {
      deactivateModel();
      refreshModels();
      setStatusMessage('Model deactivated.');
      return;
    }

    const targetModel = models.find(m => m.id === item.value);
    if (!targetModel) return;

    if (!targetModel.isAvailable) {
      setStatusMessage(`Model file "${targetModel.fileName}" not found in models/ folder.`);
      return;
    }

    if (targetModel.isActive) {
      setStatusMessage(`${targetModel.displayName} is already active.`);
      return;
    }

    try {
      setActiveModel(targetModel.id);
      refreshModels();
      setStatusMessage(`✓ Activated ${targetModel.displayName}.`);
    } catch (err) {
      setStatusMessage(`[ERROR] ${err.message}`);
    }
  };

  const items = [
    ...models.map(m => {
      let badge = '';
      if (m.isActive) badge = ' [ACTIVE]';
      else if (m.isAvailable) badge = ` [${m.sizeMb} MB]`;
      else badge = ' [NOT FOUND IN models/]';

      return {
        key: `mod_${m.id}`,
        label: `${m.displayName}${badge}`,
        value: m.id,
      };
    }),
    ...(currentActive ? [{
      key: 'act_deactivate',
      label: '⏏ Deactivate / Unload Active Model',
      value: 'deactivate',
    }] : []),
    {
      key: 'act_back',
      label: 'Back to Main Menu',
      value: 'back',
    },
  ];

  return h(
    Box,
    { flexDirection: 'column' },
    requiredWarning
      ? h(
          Box,
          { borderStyle: 'round', borderColor: 'yellow', paddingX: 1, marginBottom: 1, flexDirection: 'column' },
          h(Text, { color: 'yellowBright', bold: true }, '⚠️ Model Required to Proceed:'),
          h(Text, { color: 'white' }, 'No Whisper model is active in state. Please select an active model below to transcribe audio:')
        )
      : null,
    h(
      Box,
      { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', padding: 1 },
      h(
        Box,
        { marginBottom: 1, flexDirection: 'column' },
        h(
          Box,
          { justifyContent: 'space-between' },
          h(Text, { bold: true, color: 'cyan' }, 'Whisper Preset & Model State Manager:'),
          currentActive
            ? h(Text, { color: 'greenBright', bold: true }, `● Active: ${currentActive.displayName}`)
            : h(Text, { color: 'yellow', bold: true }, '○ None (No Active Model)')
        ),
        currentActive?.description
          ? h(Box, { marginTop: 0 }, h(Text, { color: 'gray', italic: true }, `  ↳ Preset: ${currentActive.description}`))
          : null
      ),
      h(SelectInput, { items, indicatorComponent: GlowingIndicator, itemComponent: GlowingItem, onSelect: handleSelect }),
      statusMessage
        ? h(
            Box,
            { marginTop: 1 },
            h(Text, { color: statusMessage.startsWith('[ERROR]') ? 'redBright' : (statusMessage.startsWith('✓') ? 'greenBright' : 'gray') }, statusMessage)
          )
        : null
    ),
    h(FooterBar, { hints: '[↑/↓] Navigate  •  [ENTER] Activate / Switch Model  •  [U] Deactivate  •  [ESC] Back' })
  );
}
