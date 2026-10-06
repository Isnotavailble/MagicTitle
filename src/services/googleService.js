import { GoogleGenAI } from '@google/genai';
import { CONFIG } from '../config.js';

export const SWIFT_SYSTEM_PROMPT = 
`You are a professional film subtitle translator.
The input consists of indexed lines formatted as: <index>|||<English dialogue>
You should not change the sequence number all the sequence index should match even when the sentence is break into words. You should respect the <index>|||<English dialogue> sequences of original file.
Task: Translate every single line into natural conversational spoken Myanmar Unicode (စကားပြောစစ်စစ်).
Strict Rules:
1. Maintain the exact line format: <index>|||<Myanmar translated text>
2. Never drop or modify the numeric index or the '|||' separator.
3. Avoid formal/bookish Burmese (never use သည်, ၏, ၌, ပါသည်). Use spoken colloquial endings (တယ်, ပါ, ဖြစ်လို့လေ, ဗျာ).
4. Do NOT omit, skip, or summarize any index. Every single provided index MUST be returned in order.
5. Output clean plain text only. Do not add markdown fences (no \`\`\`), conversational intros, or notes.`;

export async function translateWithGoogle(formattedInput, customKey = null) {
  const apiKey = (customKey || CONFIG.gemini.apiKey || '').trim();
  const modelName = CONFIG.gemini.model || 'gemini-2.5-flash-lite';

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
        systemInstruction: SWIFT_SYSTEM_PROMPT,
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
      systemInstruction: { parts: [{ text: SWIFT_SYSTEM_PROMPT }] },
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
