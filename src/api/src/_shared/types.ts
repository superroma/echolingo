export type { PlaylistEntry } from './playlist.js';

export const LANG_CODES = [
  'el', 'es', 'it', 'fr', 'de', 'pt', 'ja', 'zh', 'en', 'ru',
] as const;
export type LangCode = (typeof LANG_CODES)[number];

export const LANG_NAME: Record<LangCode, string> = {
  el: 'Greek',
  es: 'Spanish',
  it: 'Italian',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ja: 'Japanese',
  zh: 'Mandarin',
  en: 'English',
  ru: 'Russian',
};

export const LESSON_LENGTHS = [5, 10, 20, 30] as const;
export type LessonLength = (typeof LESSON_LENGTHS)[number];

export const LESSON_LEVELS = [1, 2, 3, 4, 5] as const;
export type LessonLevel = (typeof LESSON_LEVELS)[number];

export const LESSON_STYLES = ['mono', 'dialogue', 'story'] as const;
export type LessonStyle = (typeof LESSON_STYLES)[number];

export const LESSON_MODES = ['target_only', 'bilingual'] as const;
export type LessonMode = (typeof LESSON_MODES)[number];

export const BILINGUAL_ORDERS = ['target_first', 'native_first'] as const;
export type BilingualOrder = (typeof BILINGUAL_ORDERS)[number];

export const TTS_ENGINES = ['openai', 'elevenlabs', 'google'] as const;
export type TtsEngineName = (typeof TTS_ENGINES)[number];

export interface LessonParams {
  topic: string;
  targetLang: LangCode;
  nativeLang: LangCode;
  lengthMin: LessonLength;
  level: LessonLevel;
  style: LessonStyle;
  mode: LessonMode;
  bilingualOrder: BilingualOrder;
  ttsEngine: TtsEngineName;
  voice?: string;
}

export type SentenceStatus = 'pending' | 'ready' | 'failed';

export interface Sentence {
  i: number;
  gr: string;
  native: string;
  status: SentenceStatus;
  grUrl?: string;
  nativeUrl?: string;
  grDurSec?: number;
  nativeDurSec?: number;
}

export type LessonStatus =
  | 'generating_script'
  | 'generating_audio'
  | 'ready'
  | 'failed';

export interface Lesson {
  id: string;
  params: LessonParams;
  status: LessonStatus;
  createdAt: string;
  updatedAt: string;
  totalSentences: number;
  readySentences: number;
  sentences: Sentence[];
  fullMp3Url?: string;
  error?: string;
}

export function isLessonParams(v: unknown): v is LessonParams {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.topic !== 'string' || o.topic.trim().length === 0) return false;
  if (!LANG_CODES.includes(o.targetLang as LangCode)) return false;
  if (!LANG_CODES.includes(o.nativeLang as LangCode)) return false;
  if (o.targetLang === o.nativeLang) return false;
  if (!LESSON_LENGTHS.includes(o.lengthMin as LessonLength)) return false;
  if (!LESSON_LEVELS.includes(o.level as LessonLevel)) return false;
  if (!LESSON_STYLES.includes(o.style as LessonStyle)) return false;
  if (!LESSON_MODES.includes(o.mode as LessonMode)) return false;
  if (!BILINGUAL_ORDERS.includes(o.bilingualOrder as BilingualOrder)) return false;
  if (!TTS_ENGINES.includes(o.ttsEngine as TtsEngineName)) return false;
  if (o.voice !== undefined && typeof o.voice !== 'string') return false;
  return true;
}
