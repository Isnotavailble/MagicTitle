import nlp from 'compromise';

/**
 * Intelligent Keyword & Entity Harvester powered by 'compromise' NLP.
 * Extracts high-density proper nouns, character entities, and domain topic nouns from probe transcripts,
 * formatting them into natural, grammatical English prose for Whisper dynamic prompt conditioning.
 */

const lex = nlp.model()?.one?.lexicon || {};

const FUNCTION_WORDS_AND_PRONOUNS = new Set([
  'anything', 'nothing', 'everything', 'something', 'someone', 'somebody',
  'everyone', 'everybody', 'anyone', 'anybody', 'nobody', 'tonight', 'today',
  'tomorrow', 'yesterday', 'yours', 'mine', 'theirs', 'ours', 'hers', 'his',
  'here', 'there', 'everywhere', 'nowhere', 'somewhere', 'anywhere', 'first',
  'last', 'next', 'then', 'what', 'when', 'where', 'why', 'how', 'who'
]);

/**
 * Checks if a word is an action verb in any form (infinitive, past, gerund, present).
 * @param {string} word 
 * @returns {boolean}
 */
function isActionVerb(word) {
  if (!word || word.length < 2) return false;
  const lower = word.toLowerCase();
  
  // Direct compromise verb query on lowercased word
  if (nlp(lower).verbs().found) return true;

  const tag = lex[lower];
  if (!tag) return false;
  const tagList = Array.isArray(tag) ? tag : [tag];
  return tagList.some(t => [
    'Verb', 'PresentTense', 'PastTense', 'Infinitive', 'Gerund', 'Copula', 'Modal'
  ].includes(t));
}

/**
 * Checks if a lowercased word is classified in the standard lexicon as a verb or function word.
 * @param {string} word 
 * @returns {boolean}
 */
function isStandardGrammarWord(word) {
  if (!word) return false;
  const lower = word.toLowerCase();
  if (FUNCTION_WORDS_AND_PRONOUNS.has(lower)) return true;
  if (isActionVerb(lower)) return true;

  const tag = lex[lower];
  if (!tag) return false;
  const tagList = Array.isArray(tag) ? tag : [tag];
  return tagList.some(t => [
    'Preposition', 'Conjunction', 'Adverb', 'Pronoun', 'Copula', 'Verb',
    'PresentTense', 'PastTense', 'Infinitive', 'Gerund', 'Modal', 'Determiner',
    'QuestionWord', 'Actor', 'Expression', 'Interjection', 'Date', 'Value'
  ].includes(t));
}

/**
 * Checks if a word inside a multi-word phrase is an action verb or function word (excluding allowed colors/honorifics).
 * @param {string} word 
 * @returns {boolean}
 */
function isActionOrFunctionWord(word) {
  if (!word) return false;
  const lower = word.toLowerCase();
  if (FUNCTION_WORDS_AND_PRONOUNS.has(lower)) return true;
  if (isActionVerb(lower)) return true;

  const tag = lex[lower];
  if (!tag) return false;
  const tagList = Array.isArray(tag) ? tag : [tag];

  // Allow honorifics (Dr, Captain) and colors (Green, Black) in multi-word entities
  if (tagList.some(t => ['Honorific', 'Color'].includes(t))) {
    return false;
  }

  return tagList.some(t => [
    'Verb', 'PresentTense', 'PastTense', 'Infinitive', 'Gerund',
    'Copula', 'Modal', 'Conjunction', 'Preposition', 'Adverb',
    'Pronoun', 'Determiner', 'QuestionWord', 'Value'
  ].includes(t));
}

/**
 * Formats an array of strings into an Oxford-comma English list.
 * @param {string[]} items 
 * @returns {string}
 */
function formatEnglishList(items) {
  if (!items || items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Extracts high-density keywords and proper nouns from probe transcript text using compromise NLP.
 * 
 * @param {string} transcriptText - Raw text or cue lines from probe pass
 * @param {object} [options]
 * @param {number} [options.maxEntities=8] - Maximum proper entity phrases
 * @param {number} [options.maxTopics=15] - Maximum topic words
 * @returns {string} Natural fluent English prompt sentence
 */
export function extractKeywordsFromTranscript(transcriptText, options = {}) {
  const { maxEntities = 8, maxTopics = 15 } = options;
  if (!transcriptText || typeof transcriptText !== 'string') return '';

  // 1. Clean lines - Strip SRT timestamps and ONLY pure music signs (♪, ♫, 🎵)
  const lines = transcriptText.split('\n');
  const cleanLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines, numeric index lines (e.g. "1", "2"), and SRT timestamp lines (e.g. "00:00:05,000 --> 00:00:08,000")
    if (!trimmed || /^\d+$/.test(trimmed) || /\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/.test(trimmed)) {
      continue;
    }

    let clean = trimmed
      .replace(/^\[.*?-->.*?\]\s*/, '') // Strip bracketed timestamps if present
      .replace(/^[♪♫🎵\s]+|[♪♫🎵\s]+$/g, '') // Strip ONLY music signs
      .trim();

    if (!clean || /^[♪♫🎵\s]+$/.test(clean)) continue;
    cleanLines.push(clean);
  }

  const fullText = cleanLines.join(' ');
  if (!fullText.trim()) return '';

  // 2. Parse text with compromise NLP and build full transcript verb registry
  const doc = nlp(fullText);
  const lowerDoc = nlp(fullText.toLowerCase());

  // Harvest all verbs recognized in context (e.g. 'kick', 'talk', 'turn', 'unblock', 'tracking', etc.)
  const contextVerbs = new Set([
    ...doc.verbs().out('array').map(v => v.toLowerCase().trim()),
    ...lowerDoc.verbs().out('array').map(v => v.toLowerCase().trim()),
  ]);

  // 3. Harvest Proper Nouns (People, Places, Organizations, Multi-word Proper Entities)
  const rawProperNouns = doc
    .match('#ProperNoun+')
    .not('#Interjection')
    .not('#Adverb')
    .not('#Pronoun')
    .not('#Conjunction')
    .not('#Preposition')
    .not('#QuestionWord')
    .not('#Verb')
    .out('array');

  const entities = [];
  const seenEntities = new Set();
  const componentWordSet = new Set();

  for (const name of rawProperNouns) {
    // Strip trailing possessives (e.g. "Superman's" -> "Superman") and edge punctuation
    const cleanName = name
      .replace(/(?:'s|['’])\b/gi, '')
      .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
      .trim();

    if (cleanName.length < 3) continue;

    const lower = cleanName.toLowerCase();
    const parts = cleanName.split(/\s+/);

    // Reject multi-word phrases that contain action verbs or grammar words (e.g. "Lantern Kick Superman")
    if (parts.length > 1 && parts.some(w => isActionOrFunctionWord(w) || contextVerbs.has(w.toLowerCase()))) {
      continue;
    }

    // If single word, ensure it's not a verb or grammar word
    if (parts.length === 1 && (isStandardGrammarWord(parts[0]) || contextVerbs.has(lower))) {
      continue;
    }

    if (seenEntities.has(lower)) continue;

    // Track constituent words so they aren't redundantly repeated in topic nouns
    for (const p of parts) componentWordSet.add(p.toLowerCase());

    seenEntities.add(lower);
    entities.push(cleanName);

    // If multi-word phrase, run Color & Honorific cleaning to extract the core character name (e.g. "Green Lantern" -> "Lantern", "Dr. Stone" -> "Stone")
    if (parts.length > 1) {
      const coreName = nlp(cleanName)
        .not('#Color')
        .not('#Honorific')
        .text()
        .replace(/(?:'s|['’])\b/gi, '')
        .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
        .trim();

      const coreLower = coreName.toLowerCase();
      if (
        coreName.length >= 3 &&
        coreLower !== lower &&
        !seenEntities.has(coreLower) &&
        !isStandardGrammarWord(coreLower) &&
        !contextVerbs.has(coreLower)
      ) {
        seenEntities.add(coreLower);
        entities.push(coreName);
      }
    }

    if (entities.length >= maxEntities) break;
  }

  // 3b. Scan for capitalized character names / vocatives that compromise treats as common nouns (e.g. "Lantern", "Batman", "Flash", "Kryptonian")
  const capWords = fullText.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  for (const capWord of capWords) {
    if (entities.length >= maxEntities) break;

    const cleanCap = capWord.replace(/(?:'s|['’])\b/gi, '').trim();
    if (cleanCap.length < 3) continue;

    const lowerCap = cleanCap.toLowerCase();
    if (
      seenEntities.has(lowerCap) ||
      contextVerbs.has(lowerCap) ||
      isStandardGrammarWord(cleanCap) ||
      nlp(lowerCap).has('#Color') ||
      nlp(lowerCap).has('#Adjective')
    ) {
      continue;
    }

    seenEntities.add(lowerCap);
    componentWordSet.add(lowerCap);
    entities.push(cleanCap);
  }

  // 4. Harvest Domain Topic Nouns (Excluding Proper Nouns, Pronouns, and Dates)
  const nounFrequency = doc
    .match('#Noun')
    .not('#ProperNoun')
    .not('#Pronoun')
    .not('#Date')
    .out('frequency');

  const topicNouns = [];
  for (const item of nounFrequency) {
    const word = (item.normal || '')
      .replace(/('s|[^a-z0-9])+$/g, '')
      .replace(/^[^a-z0-9]+/g, '');

    if (
      word.length < 3 ||
      isStandardGrammarWord(word) ||
      contextVerbs.has(word) ||
      seenEntities.has(word) ||
      componentWordSet.has(word)
    ) {
      continue;
    }

    if (!topicNouns.includes(word)) {
      topicNouns.push(word);
      if (topicNouns.length >= maxTopics) break;
    }
  }

  if (entities.length === 0 && topicNouns.length === 0) {
    return '';
  }

  // 5. Construct natural English prose prompt
  const parts = [];
  if (entities.length > 0) {
    parts.push(`The following dialogue features ${formatEnglishList(entities)}.`);
  }
  if (topicNouns.length > 0) {
    if (entities.length > 0) {
      parts.push(`Topics and context include ${formatEnglishList(topicNouns)}.`);
    } else {
      parts.push(`The following dialogue context includes ${formatEnglishList(topicNouns)}.`);
    }
  }

  return parts.join(' ');
}
