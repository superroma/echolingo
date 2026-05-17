export const DEFAULT_LESSON_CONTAINER = 'lessons';
export const DEFAULT_AUDIO_CONTAINER = 'audio';
export const DEFAULT_RATE_LIMIT_CONTAINER = 'rate-limits';
export const DEFAULT_SCRIPT_GEN_QUEUE = 'script-gen';
export const DEFAULT_TTS_SENTENCE_QUEUE = 'tts-sentence';

export type LlmEngineName = 'mock' | 'openai';
export type TtsEngineName = 'mock' | 'openai';

export interface OpenAiConfig {
  apiKey: string;
  llmModel: string;
  ttsModel: string;
}

export interface Config {
  storageConnectionString: string;
  lessonsContainer: string;
  audioContainer: string;
  rateLimitContainer: string;
  scriptGenQueue: string;
  ttsSentenceQueue: string;
  llmEngine: LlmEngineName;
  ttsEngine: TtsEngineName;
  rateLimitPerDay: number;
  openai?: OpenAiConfig;
  appInsightsConnectionString?: string;
}

export function loadConfig(): Config {
  const storageConnectionString = process.env.AzureWebJobsStorage;
  if (!storageConnectionString) {
    throw new Error('AzureWebJobsStorage environment variable is required');
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const llmEnvChoice = process.env.LLM_ENGINE;
  const ttsEnvChoice = process.env.TTS_ENGINE;

  const llmEngine: LlmEngineName =
    llmEnvChoice === 'mock' ? 'mock' :
    llmEnvChoice === 'openai' ? 'openai' :
    openaiKey ? 'openai' : 'mock';

  const ttsEngine: TtsEngineName =
    ttsEnvChoice === 'mock' ? 'mock' :
    ttsEnvChoice === 'openai' ? 'openai' :
    openaiKey ? 'openai' : 'mock';

  if ((llmEngine === 'openai' || ttsEngine === 'openai') && !openaiKey) {
    throw new Error('OPENAI_API_KEY is required when LLM_ENGINE or TTS_ENGINE is openai');
  }

  const openai: OpenAiConfig | undefined = openaiKey
    ? {
        apiKey: openaiKey,
        llmModel: process.env.OPENAI_LLM_MODEL ?? 'gpt-4o-mini',
        ttsModel: process.env.OPENAI_TTS_MODEL ?? 'tts-1',
      }
    : undefined;

  return {
    storageConnectionString,
    lessonsContainer: process.env.LESSONS_CONTAINER ?? DEFAULT_LESSON_CONTAINER,
    audioContainer: process.env.AUDIO_CONTAINER ?? DEFAULT_AUDIO_CONTAINER,
    rateLimitContainer: process.env.RATE_LIMIT_CONTAINER ?? DEFAULT_RATE_LIMIT_CONTAINER,
    scriptGenQueue: process.env.SCRIPT_GEN_QUEUE ?? DEFAULT_SCRIPT_GEN_QUEUE,
    ttsSentenceQueue: process.env.TTS_SENTENCE_QUEUE ?? DEFAULT_TTS_SENTENCE_QUEUE,
    llmEngine,
    ttsEngine,
    rateLimitPerDay: parseInt(process.env.RATE_LIMIT_PER_DAY ?? '20', 10),
    openai,
    appInsightsConnectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  };
}
