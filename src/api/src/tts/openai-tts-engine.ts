import OpenAI, { AzureOpenAI, APIError } from 'openai';
import {
  estimateMp3DurationSec,
  retryWithBackoff,
  type TtsEngine,
  type TtsLang,
  type TtsSynthesizeRequest,
  type TtsSynthesizeResult,
} from '../_shared/index.js';

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
        }),
      { maxAttempts: this.maxAttempts, baseDelayMs: this.baseDelayMs, isRetriable },
    );
    const mp3 = Buffer.from(await response.arrayBuffer());
    return { mp3, durationSec: estimateMp3DurationSec(req.text) };
  }
}
