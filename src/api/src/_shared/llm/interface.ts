import type { BuiltPrompt } from '../prompts.js';

export interface LlmEngine {
  readonly name: 'mock' | 'openai';
  generateScript(prompt: BuiltPrompt): Promise<string>;
}
