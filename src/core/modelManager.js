import path from 'path';
import fs from 'fs';
import { PROJECT_ROOT, MODEL_PROFILES } from '../config.js';

let activeModelId = 'small-en'; // Default active model if available, or null

// Dynamically initialize active model: prioritize 'small-en', check optional preferred env, otherwise pick first available profile on disk
function initDefaultActiveModel() {
  const modelsDir = path.join(PROJECT_ROOT, 'models');

  // 1. Optional preferred model from environment (e.g. DEFAULT_WHISPER_MODEL)
  const preferredId = process.env.DEFAULT_WHISPER_MODEL;
  if (preferredId && MODEL_PROFILES[preferredId]) {
    if (MODEL_PROFILES[preferredId].fileName) {
      const candidatePath = path.join(modelsDir, MODEL_PROFILES[preferredId].fileName);
      if (fs.existsSync(candidatePath)) {
        activeModelId = preferredId;
        return;
      }
    } else if (MODEL_PROFILES[preferredId].isCloud && process.env.GROQ_API_KEY) {
      activeModelId = preferredId;
      return;
    }
  }

  // 2. Default to 'small-en' if present on disk
  if (MODEL_PROFILES['small-en']?.fileName) {
    const smallEnPath = path.join(modelsDir, MODEL_PROFILES['small-en'].fileName);
    if (fs.existsSync(smallEnPath)) {
      activeModelId = 'small-en';
      return;
    }
  }

  // 3. Dynamically pick the first model in MODEL_PROFILES whose file exists on disk
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
    if (profile.isCloud) {
      return {
        ...profile,
        fullPath: 'Groq Cloud API',
        isAvailable: Boolean(process.env.GROQ_API_KEY),
        sizeMb: 'Cloud',
        isActive: activeModelId === profile.id,
      };
    }
    const fullPath = profile.fileName ? path.join(modelsDir, profile.fileName) : null;
    const exists = fullPath ? fs.existsSync(fullPath) : false;
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
  if (profile.isCloud) return Boolean(process.env.GROQ_API_KEY);
  const modelsDir = path.join(PROJECT_ROOT, 'models');
  return profile.fileName ? fs.existsSync(path.join(modelsDir, profile.fileName)) : false;
}

/**
 * Gets the profile of the currently active model, or null if none is active.
 * @returns {object|null}
 */
export function getActiveModel() {
  if (!activeModelId) return null;
  const profile = MODEL_PROFILES[activeModelId];
  if (!profile) return null;
  if (profile.isCloud) {
    return { ...profile, fullPath: 'Groq Cloud API' };
  }
  const modelsDir = path.join(PROJECT_ROOT, 'models');
  const fullPath = profile.fileName ? path.join(modelsDir, profile.fileName) : null;
  if (!fullPath || !fs.existsSync(fullPath)) return null;
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
  if (profile.isCloud) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY secret not found in .env file.');
    }
    activeModelId = modelId;
    return { ...profile, fullPath: 'Groq Cloud API' };
  }
  const modelsDir = path.join(PROJECT_ROOT, 'models');
  const fullPath = profile.fileName ? path.join(modelsDir, profile.fileName) : null;
  if (!fullPath || !fs.existsSync(fullPath)) {
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
