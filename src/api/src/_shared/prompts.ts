import { LANG_NAME, type LessonParams, type LessonStyle, type LessonLevel } from './types.js';

const WORDS_PER_MINUTE = 130;

const LEVEL_DESCRIPTOR: Record<LessonLevel, string> = {
  1: 'level 1 (beginner — very simple vocabulary, short present-tense sentences)',
  2: 'level 2 (high beginner — common vocabulary, simple past/present, short sentences)',
  3: 'level 3 (intermediate — everyday vocabulary, common tenses, natural sentence length)',
  4: 'level 4 (upper-intermediate — richer vocabulary, varied tenses and subordination)',
  5: 'level 5 (advanced — idiomatic vocabulary, complex grammar, long varied sentences)',
};

const STYLE_INSTRUCTION: Record<LessonStyle, string> = {
  mono: 'Write a single-narrator monologue (essay-like) on the topic.',
  dialogue:
    'Write a natural dialogue between two named speakers on the topic. Prefix each line with the speaker name and a colon, e.g. "Maria: ...".',
  story: 'Write a short narrative story on the topic with a clear setting and small plot.',
};

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildPrompt(params: LessonParams): BuiltPrompt {
  const targetWords = Math.round(params.lengthMin * WORDS_PER_MINUTE);
  const targetName = LANG_NAME[params.targetLang];
  const nativeName = LANG_NAME[params.nativeLang];
  const level = LEVEL_DESCRIPTOR[params.level];
  const styleInstruction = STYLE_INSTRUCTION[params.style];

  const system =
    `You are a ${targetName} language tutor producing bilingual listening lessons. ` +
    `You write idiomatic ${targetName} and provide accurate ${nativeName} translations.`;

  const user = [
    `Topic: ${params.topic}`,
    `Target length: approximately ${targetWords} words of spoken ${targetName}.`,
    `${targetName} difficulty: ${level}.`,
    styleInstruction,
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
