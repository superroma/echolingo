export const DEFAULT_ECHO_CONTAINER = 'echoes';
export const DEFAULT_AUDIO_CONTAINER = 'audio';
export const DEFAULT_RATE_LIMIT_CONTAINER = 'rate-limits';
export const DEFAULT_SCRIPT_GEN_QUEUE = 'script-gen';
export const DEFAULT_TTS_SENTENCE_QUEUE = 'tts-sentence';

export type LlmEngineName = 'mock' | 'openai';
export type TtsEngineName = 'mock' | 'openai';

export interface OpenAiDirectConfig {
  kind: 'direct';
  apiKey: string;
  llmModel: string;
  ttsModel: string;
}

export interface OpenAiAzureConfig {
  kind: 'azure';
  endpoint: string;
  apiVersion: string;
  llmDeployment: string;
  ttsDeployment: string;
  // TTS lives in its own AOAI account/region (gpt-4o-mini-tts isn't offered in
  // the LLM region). Falls back to the LLM endpoint/apiVersion when unset.
  ttsEndpoint?: string;
  ttsApiVersion?: string;
}

export type OpenAiConfig = OpenAiDirectConfig | OpenAiAzureConfig;

export interface StorageConfig {
  storageConnectionString?: string;
  blobEndpoint?: string;
  queueEndpoint?: string;
  echoesContainer: string;
  audioContainer: string;
  rateLimitContainer: string;
  scriptGenQueue: string;
  ttsSentenceQueue: string;
}

export interface Config extends StorageConfig {
  llmEngine: LlmEngineName;
  ttsEngine: TtsEngineName;
  rateLimitPerDay: number;
  openai?: OpenAiConfig;
  appInsightsConnectionString?: string;
}

export function loadConfig(): Config {
  const useAzureStorage =
    !!process.env.STORAGE_BLOB_ENDPOINT || !!process.env.AzureWebJobsStorage__accountName;

  if (!useAzureStorage && !process.env.AzureWebJobsStorage) {
    throw new Error('AzureWebJobsStorage or STORAGE_BLOB_ENDPOINT environment variable is required');
  }

  const accountName = process.env.AzureWebJobsStorage__accountName;
  const blobEndpoint =
    process.env.STORAGE_BLOB_ENDPOINT ??
    (accountName ? `https://${accountName}.blob.core.windows.net` : undefined);
  const queueEndpoint =
    process.env.STORAGE_QUEUE_ENDPOINT ??
    (accountName ? `https://${accountName}.queue.core.windows.net` : undefined);

  const openaiKey = process.env.OPENAI_API_KEY;
  const azureOpenAiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const llmEnvChoice = process.env.LLM_ENGINE;
  const ttsEnvChoice = process.env.TTS_ENGINE;

  const hasOpenAi = !!openaiKey || !!azureOpenAiEndpoint;

  const llmEngine: LlmEngineName =
    llmEnvChoice === 'mock' ? 'mock' :
    llmEnvChoice === 'openai' ? 'openai' :
    hasOpenAi ? 'openai' : 'mock';

  const ttsEngine: TtsEngineName =
    ttsEnvChoice === 'mock' ? 'mock' :
    ttsEnvChoice === 'openai' ? 'openai' :
    hasOpenAi ? 'openai' : 'mock';

  if ((llmEngine === 'openai' || ttsEngine === 'openai') && !hasOpenAi) {
    throw new Error('OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT is required when LLM_ENGINE or TTS_ENGINE is openai');
  }

  let openai: OpenAiConfig | undefined;
  if (azureOpenAiEndpoint) {
    openai = {
      kind: 'azure',
      endpoint: azureOpenAiEndpoint,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21',
      llmDeployment: process.env.AZURE_OPENAI_LLM_DEPLOYMENT ?? 'gpt-5.4-mini',
      ttsDeployment: process.env.AZURE_OPENAI_TTS_DEPLOYMENT ?? 'gpt-4o-mini-tts',
      ttsEndpoint: process.env.AZURE_OPENAI_TTS_ENDPOINT,
      ttsApiVersion: process.env.AZURE_OPENAI_TTS_API_VERSION,
    };
  } else if (openaiKey) {
    openai = {
      kind: 'direct',
      apiKey: openaiKey,
      llmModel: process.env.OPENAI_LLM_MODEL ?? 'gpt-4o-mini',
      ttsModel: process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts',
    };
  }

  return {
    storageConnectionString: useAzureStorage ? undefined : process.env.AzureWebJobsStorage,
    blobEndpoint,
    queueEndpoint,
    echoesContainer: process.env.ECHOES_CONTAINER ?? DEFAULT_ECHO_CONTAINER,
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
