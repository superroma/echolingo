import { LANG_NAME, type EchoParams, type EchoLevel } from './types.js';

const WORDS_PER_MINUTE = 130;

const LEVEL_DESCRIPTOR: Record<EchoLevel, string> = {
  1: 'CEFR A1 (beginner — very simple high-frequency vocabulary, short present-tense sentences)',
  2: 'CEFR A2 (elementary — common everyday vocabulary, simple past/present, short sentences)',
  3: 'CEFR B1 (intermediate — everyday vocabulary, common tenses, natural sentence length)',
  4: 'CEFR B2 (upper-intermediate — richer vocabulary, varied tenses and subordination)',
  5: 'CEFR C1 (advanced — idiomatic vocabulary, complex grammar, long varied sentences)',
  6: 'CEFR C2 (mastery — nuanced, idiomatic, sophisticated register and structure)',
};

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildPrompt(params: EchoParams): BuiltPrompt {
  const targetWords = Math.round(params.lengthMin * WORDS_PER_MINUTE);
  const targetName = LANG_NAME[params.targetLang];
  const nativeName = LANG_NAME[params.nativeLang];
  const level = LEVEL_DESCRIPTOR[params.level];

  const system =
    `You are a ${targetName} language tutor producing bilingual listening echoes. ` +
    `You write idiomatic ${targetName} and provide accurate ${nativeName} translations.`;

  const user = [
    `Topic: ${params.topic}`,
    `Target length: approximately ${targetWords} words of spoken ${targetName}.`,
    `${targetName} difficulty: ${level}.`,
    '',
    'OUTPUT FORMAT (strict):',
    `- One line per sentence pair, in the form: ${targetName.toUpperCase()}_SENTENCE||${nativeName.toUpperCase()}_SENTENCE`,
    '- Separator is exactly two pipe characters: ||',
    '- Do not number the lines.',
    '- Do not output anything outside the pairs (no headings, no commentary).',
    '- Translations must be accurate, natural, and complete — not literal word-for-word.',
    `- Each ${targetName} sentence should be one sentence (not a paragraph). Split long ideas into multiple pairs.`,
  ].join('\n');

  return { system, user };
}
