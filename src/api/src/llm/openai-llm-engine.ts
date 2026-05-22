import OpenAI, { AzureOpenAI, APIError } from 'openai';
import { retryWithBackoff, type BuiltPrompt, type LlmEngine } from '../_shared/index.js';

export type OpenAiLlmEngineAuth =
  | { kind: 'direct'; apiKey: string }
  | { kind: 'azure'; endpoint: string; apiVersion: string; azureADTokenProvider: () => Promise<string> };

export interface OpenAiLlmEngineOptions {
  auth: OpenAiLlmEngineAuth;
  model: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  temperature?: number;
}

function isRetriable(err: unknown): boolean {
  if (err instanceof APIError) {
    if (err.status === 429) return true;
    return err.status >= 500;
  }
  return true;
}

export class OpenAiLlmEngine implements LlmEngine {
  readonly name = 'openai' as const;
  private readonly client: OpenAI | AzureOpenAI;
  private readonly model: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly temperature: number;

  constructor(opts: OpenAiLlmEngineOptions) {
    this.model = opts.model;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.temperature = opts.temperature ?? 0.7;
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
