import type { BuiltPrompt } from '../prompts.js';
import type { LlmEngine } from './interface.js';

const DEFAULT_SCRIPT = [
  'Καλημέρα.||Good morning.',
  'Σήμερα μιλάμε για ένα νέο θέμα.||Today we talk about a new topic.',
  'Πώς είσαι;||How are you?',
  'Είμαι πολύ καλά, ευχαριστώ.||I am very well, thank you.',
  'Τι κάνεις σήμερα;||What are you doing today?',
].join('\n');

export interface MockLlmEngineOptions {
  script?: string;
}

export class MockLlmEngine implements LlmEngine {
  readonly name = 'mock' as const;

  constructor(private readonly options: MockLlmEngineOptions = {}) {}

  async generateScript(_prompt: BuiltPrompt): Promise<string> {
    return this.options.script ?? DEFAULT_SCRIPT;
  }
}
