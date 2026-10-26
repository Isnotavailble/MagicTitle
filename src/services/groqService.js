import OpenAI from 'openai';
import { CONFIG } from '../config.js';

const DEFAULT_TRANSLATE_PROMPT =
  'You are a professional film subtitle translator. Translate every single line into natural conversational spoken Myanmar Unicode (စကားပြောစစ်စစ်). Maintain the exact line format: <index>|||<Myanmar translated text>. Avoid formal/bookish Burmese. English words and acronyms are allowed when appropriate, but never insert Chinese, Thai, Hindi, or other foreign scripts.';

export async function translateWithGroq(formattedInput, customKey = null, systemPrompt = null) {
  const apiKey = (customKey || CONFIG.groq.apiKey || '').trim();
  const modelName = CONFIG.groq.model || 'qwen/qwen3.8-27b';
  const systemInstruction = systemPrompt || DEFAULT_TRANSLATE_PROMPT;

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
        content: systemInstruction,
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
