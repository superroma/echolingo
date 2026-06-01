import OpenAI, { AzureOpenAI, APIError } from 'openai';
import {
  estimateMp3DurationSec,
  retryWithBackoff,
  LANG_NAME,
  type TtsEngine,
  type TtsLang,
  type TtsSynthesizeRequest,
  type TtsSynthesizeResult,
} from '../_shared/index.js';

/**
 * Pin the spoken language. OpenAI's classic `tts`/`tts-1` voices guess the
 * language from the input alone and collapse into gibberish for ~10% of short
 * non-English (e.g. Greek) sentences. The gpt-4o-mini-tts–class models accept
 * `instructions`, so we state the language explicitly and forbid translation.
 */
export function speechInstructions(lang: TtsLang): string {
  const name = LANG_NAME[lang];
  // Two jobs: (1) pin the language so the model doesn't guess (the gibberish
  // fix), and (2) pin ONE consistent narrator. gpt-4o-mini-tts is generative
  // and otherwise drifts timbre/persona between calls and "acts out" lines, so
  // sentences end up in different voices. Force a single steady reader.
  return [
    `Read the text aloud in ${name} with natural, native ${name} pronunciation.`,
    `Use one single, consistent narrator for every sentence: the same calm, neutral, adult voice, timbre, pace, and tone throughout.`,
    `Do not act out characters, change accent or persona, or vary the delivery between sentences.`,
    `Read the text exactly as written — do not translate, summarize, or add any words.`,
  ].join(' ');
}

/** Classic tts / tts-hd / tts-1 ignore `instructions`; only newer models steer. */
function acceptsInstructions(model: string): boolean {
  return !model.startsWith('tts');
}

export type OpenAiTtsEngineAuth =
  | { kind: 'direct'; apiKey: string }
  | { kind: 'azure'; endpoint: string; apiVersion: string; azureADTokenProvider: () => Promise<string> };

export interface OpenAiTtsEngineOptions {
  auth: OpenAiTtsEngineAuth;
  model: string;
  defaultVoice?: string;
  maxAttempts?: number;
  baseDelayMs?: number;
}

const DEFAULT_VOICE = 'alloy';

function isRetriable(err: unknown): boolean {
  if (err instanceof APIError) {
    if (err.status === 429) return true;
    return err.status >= 500;
  }
  return true;
}

export class OpenAiTtsEngine implements TtsEngine {
  readonly name = 'openai' as const;
  private readonly client: OpenAI | AzureOpenAI;
  private readonly model: string;
  private readonly defaultVoice: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(opts: OpenAiTtsEngineOptions) {
    this.model = opts.model;
    this.defaultVoice = opts.defaultVoice ?? DEFAULT_VOICE;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    if (opts.auth.kind === 'direct') {
      this.client = new OpenAI({ apiKey: opts.auth.apiKey });
    } else {
      this.client = new AzureOpenAI({
        endpoint: opts.auth.endpoint,
        apiVersion: opts.auth.apiVersion,
        azureADTokenProvider: opts.auth.azureADTokenProvider,
      });
    }
  }

  async synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    const voice = req.voice ?? this.defaultVoice;
    const response = await retryWithBackoff(
      () =>
        this.client.audio.speech.create({
          model: this.model,
          voice,
          input: req.text,
          response_format: 'mp3',
          ...(acceptsInstructions(this.model)
            ? { instructions: speechInstructions(req.lang) }
            : {}),
        }),
      { maxAttempts: this.maxAttempts, baseDelayMs: this.baseDelayMs, isRetriable },
    );
    const mp3 = Buffer.from(await response.arrayBuffer());
    return { mp3, durationSec: estimateMp3DurationSec(req.text) };
  }
}
