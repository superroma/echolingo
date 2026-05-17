import OpenAI, { APIError } from 'openai';
import { retryWithBackoff, type BuiltPrompt, type LlmEngine } from '@echolingo/shared';

export interface OpenAiLlmEngineOptions {
  apiKey: string;
  model?: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  temperature?: number;
}

const DEFAULT_MODEL = 'gpt-4o-mini';

function isRetriable(err: unknown): boolean {
  if (err instanceof APIError) {
    if (err.status === 429) return true;
    return err.status >= 500;
  }
  return true;
}

export class OpenAiLlmEngine implements LlmEngine {
  readonly name = 'openai' as const;
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly temperature: number;

  constructor(opts: OpenAiLlmEngineOptions) {
    this.client = new OpenAI({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.temperature = opts.temperature ?? 0.7;
  }

  async generateScript(prompt: BuiltPrompt): Promise<string> {
    const res = await retryWithBackoff(
      () =>
        this.client.chat.completions.create({
          model: this.model,
          temperature: this.temperature,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        }),
      { maxAttempts: this.maxAttempts, baseDelayMs: this.baseDelayMs, isRetriable },
    );
    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty content');
    return content;
  }
}
