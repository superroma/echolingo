export type { PlaylistEntry } from './playlist.js';

// Languages supported by the gpt-4o-mini-tts speech model (OpenAI's published
// speech-language set), ordered alphabetically by English name.
export const LANG_CODES = [
  'af', 'ar', 'hy', 'az', 'be', 'bs', 'bg', 'ca', 'zh', 'hr',
  'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'gl', 'de', 'el',
  'he', 'hi', 'hu', 'is', 'id', 'it', 'ja', 'kn', 'kk', 'ko',
  'lv', 'lt', 'mk', 'ms', 'mi', 'mr', 'ne', 'no', 'fa', 'pl',
  'pt', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'sw', 'sv', 'tl',
  'ta', 'th', 'tr', 'uk', 'ur', 'vi', 'cy',
] as const;
export type LangCode = (typeof LANG_CODES)[number];

export const LANG_NAME: Record<LangCode, string> = {
  af: 'Afrikaans',
  ar: 'Arabic',
  hy: 'Armenian',
  az: 'Azerbaijani',
  be: 'Belarusian',
  bs: 'Bosnian',
  bg: 'Bulgarian',
  ca: 'Catalan',
  zh: 'Chinese',
  hr: 'Croatian',
  cs: 'Czech',
  da: 'Danish',
  nl: 'Dutch',
  en: 'English',
  et: 'Estonian',
  fi: 'Finnish',
  fr: 'French',
  gl: 'Galician',
  de: 'German',
  el: 'Greek',
  he: 'Hebrew',
  hi: 'Hindi',
  hu: 'Hungarian',
  is: 'Icelandic',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  kn: 'Kannada',
  kk: 'Kazakh',
  ko: 'Korean',
  lv: 'Latvian',
  lt: 'Lithuanian',
  mk: 'Macedonian',
  ms: 'Malay',
  mr: 'Marathi',
  mi: 'Maori',
  ne: 'Nepali',
  no: 'Norwegian',
  fa: 'Persian',
  pl: 'Polish',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sr: 'Serbian',
  sk: 'Slovak',
  sl: 'Slovenian',
  es: 'Spanish',
  sw: 'Swahili',
  sv: 'Swedish',
  tl: 'Tagalog',
  ta: 'Tamil',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  ur: 'Urdu',
  vi: 'Vietnamese',
  cy: 'Welsh',
};

export const ECHO_LENGTHS = [5, 10, 20, 30] as const;
export type EchoLength = (typeof ECHO_LENGTHS)[number];

export const ECHO_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type EchoLevel = (typeof ECHO_LEVELS)[number];

export const CEFR_LABEL: Record<EchoLevel, string> = {
  1: 'A1',
  2: 'A2',
  3: 'B1',
  4: 'B2',
  5: 'C1',
  6: 'C2',
};

/** CEFR band label for a level, clamping out-of-range input to the nearest end. */
export function cefr(level: number): string {
  const n = Math.min(6, Math.max(1, Math.round(level))) as EchoLevel;
  return CEFR_LABEL[n];
}

export const ECHO_MODES = ['target_only', 'bilingual'] as const;
export type EchoMode = (typeof ECHO_MODES)[number];

export const BILINGUAL_ORDERS = ['target_first', 'native_first'] as const;
export type BilingualOrder = (typeof BILINGUAL_ORDERS)[number];

export const TTS_ENGINES = ['openai', 'elevenlabs', 'google'] as const;
export type TtsEngineName = (typeof TTS_ENGINES)[number];

export interface EchoParams {
  topic: string;
  targetLang: LangCode;
  nativeLang: LangCode;
  lengthMin: EchoLength;
  level: EchoLevel;
  mode: EchoMode;
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

export type EchoStatus =
  | 'generating_script'
  | 'generating_audio'
  | 'ready'
  | 'failed';

export interface Echo {
  id: string;
  params: EchoParams;
  status: EchoStatus;
  createdAt: string;
  updatedAt: string;
  totalSentences: number;
  readySentences: number;
  sentences: Sentence[];
  fullMp3Url?: string;
  error?: string;
}

/** Echo ids are 1–16 base62 chars. The web mints 8; the cap leaves headroom. */
export const ECHO_ID_RE = /^[0-9A-Za-z]{1,16}$/;

export function isEchoId(v: unknown): v is string {
  return typeof v === 'string' && ECHO_ID_RE.test(v);
}

export function isEchoParams(v: unknown): v is EchoParams {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.topic !== 'string' || o.topic.trim().length === 0) return false;
  if (!LANG_CODES.includes(o.targetLang as LangCode)) return false;
  if (!LANG_CODES.includes(o.nativeLang as LangCode)) return false;
  if (o.targetLang === o.nativeLang) return false;
  if (!ECHO_LENGTHS.includes(o.lengthMin as EchoLength)) return false;
  if (!ECHO_LEVELS.includes(o.level as EchoLevel)) return false;
  if (!ECHO_MODES.includes(o.mode as EchoMode)) return false;
  if (!BILINGUAL_ORDERS.includes(o.bilingualOrder as BilingualOrder)) return false;
  if (!TTS_ENGINES.includes(o.ttsEngine as TtsEngineName)) return false;
  if (o.voice !== undefined && typeof o.voice !== 'string') return false;
  return true;
}
