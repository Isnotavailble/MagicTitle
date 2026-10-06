import OpenAI from 'openai';
import { CONFIG } from '../config.js';
import { SWIFT_SYSTEM_PROMPT } from './googleService.js';

export async function translateWithGroq(formattedInput, customKey = null) {
  const apiKey = (customKey || CONFIG.groq.apiKey || '').trim();
  const modelName = CONFIG.groq.model || 'qwen/qwen3.8-27b';

  if (!apiKey) {
    throw new Error('Groq API Key is missing. Please set GROQ_API_KEY in .env');
  }

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const completion = await client.chat.completions.create({
    model: modelName,
    messages: [
      {
        role: 'system',
        content: SWIFT_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: formattedInput,
      },
    ],
    temperature: CONFIG.groq.temperature,
    max_tokens: CONFIG.groq.maxTokens,
  });

  let raw = completion.choices?.[0]?.message?.content?.trim() || '';
  return cleanResponse(raw);
}

function cleanResponse(text) {
  return text
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/s, '')
    .trim();
}
