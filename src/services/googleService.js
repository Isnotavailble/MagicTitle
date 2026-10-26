import { GoogleGenAI } from '@google/genai';
import { CONFIG } from '../config.js';

const DEFAULT_TRANSLATE_PROMPT =
  'You are a professional film subtitle translator. Translate every single line into natural conversational spoken Myanmar Unicode (စကားပြောစစ်စစ်). Maintain the exact line format: <index>|||<Myanmar translated text>. Avoid formal/bookish Burmese. English words and acronyms are allowed when appropriate, but never insert Chinese, Thai, Hindi, or other foreign scripts.';

export async function translateWithGoogle(formattedInput, customKey = null, systemPrompt = null) {
  const apiKey = (customKey || CONFIG.gemini.apiKey || '').trim();
  const modelName = CONFIG.gemini.model || 'gemini-2.5-flash-lite';
  const systemInstruction = systemPrompt || DEFAULT_TRANSLATE_PROMPT;

  if (!apiKey) {
    throw new Error('Google Gemini API Key is missing. Please set GEMINI_API_KEY in .env');
  }

  // 1. Try GoogleGenAI SDK
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelName,
      contents: formattedInput,
      config: {
        systemInstruction,
        temperature: CONFIG.gemini.temperature,
        maxOutputTokens: CONFIG.gemini.maxTokens,
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      },
    });

    let text = response.text || '';
    if (text.trim()) return cleanResponse(text);
  } catch (sdkError) {
    // If SDK fails, continue to Google REST API
  }

  // 2. Direct Google Generative Language REST API
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: formattedInput }] }],
      generationConfig: {
        temperature: CONFIG.gemini.temperature,
        maxOutputTokens: CONFIG.gemini.maxTokens,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  return cleanResponse(raw);
}

function cleanResponse(text) {
  return text
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/s, '')
    .trim();
}
