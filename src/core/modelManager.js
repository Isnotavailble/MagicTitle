import path from 'path';
import fs from 'fs';
import { PROJECT_ROOT, MODEL_PROFILES } from '../config.js';

let activeModelId = 'small-en'; // Default active model if available, or null

// Dynamically initialize active model: check optional preferred env, otherwise pick first available profile on disk
function initDefaultActiveModel() {
  const modelsDir = path.join(PROJECT_ROOT, 'models');

  // 1. Optional preferred model from environment (e.g. DEFAULT_WHISPER_MODEL)
  const preferredId = process.env.DEFAULT_WHISPER_MODEL;
  if (preferredId && MODEL_PROFILES[preferredId]) {
    const candidatePath = path.join(modelsDir, MODEL_PROFILES[preferredId].fileName);
    if (fs.existsSync(candidatePath)) {
      activeModelId = preferredId;
      return;
    }
  }

  // 2. Dynamically pick the first model in MODEL_PROFILES whose file exists on disk
  const firstAvailable = Object.values(MODEL_PROFILES).find(profile => {
    if (!profile?.fileName) return false;
    return fs.existsSync(path.join(modelsDir, profile.fileName));
  });

  activeModelId = firstAvailable ? firstAvailable.id : null;
}

initDefaultActiveModel();

/**
 * Returns all defined model profiles enriched with their disk availability and active status.
 * @returns {Array<object>}
 */
export function getAvailableModels() {
  const modelsDir = path.join(PROJECT_ROOT, 'models');
  return Object.values(MODEL_PROFILES).map(profile => {
    const fullPath = path.join(modelsDir, profile.fileName);
    const exists = fs.existsSync(fullPath);
    let sizeMb = null;
    if (exists) {
      try {
        const stats = fs.statSync(fullPath);
        sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
      } catch {}
    }
    const isActive = activeModelId === profile.id;
    return {
      ...profile,
      fullPath,
      isAvailable: exists,
      sizeMb,
      isActive,
    };
  });
}

/**
 * Checks if a model is currently active.
 * @returns {boolean}
 */
export function isModelActive() {
  if (!activeModelId) return false;
  const profile = MODEL_PROFILES[activeModelId];
  if (!profile) return false;
  const modelsDir = path.join(PROJECT_ROOT, 'models');
  return fs.existsSync(path.join(modelsDir, profile.fileName));
}

/**
 * Gets the profile of the currently active model, or null if none is active.
 * @returns {object|null}
 */
export function getActiveModel() {
  if (!activeModelId) return null;
  const profile = MODEL_PROFILES[activeModelId];
  if (!profile) return null;
  const modelsDir = path.join(PROJECT_ROOT, 'models');
  const fullPath = path.join(modelsDir, profile.fileName);
  if (!fs.existsSync(fullPath)) return null;
  return {
    ...profile,
    fullPath,
  };
}

/**
 * Sets the active model.
 * @param {string} modelId
 * @returns {object} Activated model profile
 */
export function setActiveModel(modelId) {
  const profile = MODEL_PROFILES[modelId];
  if (!profile) {
    throw new Error(`Unknown model ID: "${modelId}".`);
  }
  const modelsDir = path.join(PROJECT_ROOT, 'models');
  const fullPath = path.join(modelsDir, profile.fileName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Model file "${profile.fileName}" not found in models/ directory.`);
  }
  activeModelId = modelId;
  return { ...profile, fullPath };
}

/**
 * Deactivates the currently active model.
 */
export function deactivateModel() {
  activeModelId = null;
}
