import {
  MockLlmEngine,
  MockTtsEngine,
  type AudioStorage,
  type LessonRepository,
  type LlmEngine,
  type TtsEngine,
} from './_shared/index.js';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { loadConfig, type Config } from './config.js';
import { BlobLessonRepository } from './storage/blob-lesson-repository.js';
import { BlobAudioStorage } from './storage/blob-audio-storage.js';
import { BlobRateLimitStore } from './storage/blob-rate-limit-store.js';
import { QueueClient } from './queue/queue-client.js';
import { OpenAiLlmEngine } from './llm/openai-llm-engine.js';
import { OpenAiTtsEngine } from './tts/openai-tts-engine.js';
import { createTelemetry, type Telemetry } from './lib/telemetry.js';

export interface RateLimitStore {
  get(ip: string, date: string): Promise<number>;
  increment(ip: string, date: string): Promise<number>;
}

export interface ApiContext {
  config: Config;
  lessons: LessonRepository;
  audio: AudioStorage;
  queue: QueueClient;
  llm: LlmEngine;
  tts: TtsEngine;
  rateLimits: RateLimitStore;
  telemetry: Telemetry;
}

let cached: ApiContext | undefined;
let cachedTokenProvider: (() => Promise<string>) | undefined;

function azureTokenProvider(): () => Promise<string> {
  if (!cachedTokenProvider) {
    cachedTokenProvider = getBearerTokenProvider(
      new DefaultAzureCredential(),
      'https://cognitiveservices.azure.com/.default',
    );
  }
  return cachedTokenProvider;
}

function buildLlm(config: Config): LlmEngine {
  if (config.llmEngine !== 'openai' || !config.openai) return new MockLlmEngine();
  if (config.openai.kind === 'azure') {
    return new OpenAiLlmEngine({
      auth: {
        kind: 'azure',
        endpoint: config.openai.endpoint,
        apiVersion: config.openai.apiVersion,
        azureADTokenProvider: azureTokenProvider(),
      },
      model: config.openai.llmDeployment,
    });
  }
  return new OpenAiLlmEngine({
    auth: { kind: 'direct', apiKey: config.openai.apiKey },
    model: config.openai.llmModel,
  });
}

function buildTts(config: Config): TtsEngine {
  if (config.ttsEngine !== 'openai' || !config.openai) return new MockTtsEngine();
  if (config.openai.kind === 'azure') {
    return new OpenAiTtsEngine({
      auth: {
        kind: 'azure',
        endpoint: config.openai.endpoint,
        apiVersion: config.openai.apiVersion,
        azureADTokenProvider: azureTokenProvider(),
      },
      model: config.openai.ttsDeployment,
    });
  }
  return new OpenAiTtsEngine({
    auth: { kind: 'direct', apiKey: config.openai.apiKey },
    model: config.openai.ttsModel,
  });
}

function buildLessons(config: Config): LessonRepository {
  if (config.blobEndpoint) {
    return new BlobLessonRepository({
      endpoint: config.blobEndpoint,
      containerName: config.lessonsContainer,
    });
  }
  return new BlobLessonRepository({
    connectionString: config.storageConnectionString!,
    containerName: config.lessonsContainer,
  });
}

function buildAudio(config: Config): AudioStorage {
  if (config.blobEndpoint) {
    return new BlobAudioStorage({
      endpoint: config.blobEndpoint,
      containerName: config.audioContainer,
    });
  }
  return new BlobAudioStorage({
    connectionString: config.storageConnectionString!,
    containerName: config.audioContainer,
  });
}

function buildRateLimits(config: Config): RateLimitStore {
  if (config.blobEndpoint) {
    return new BlobRateLimitStore({
      endpoint: config.blobEndpoint,
      containerName: config.rateLimitContainer,
    });
  }
  return new BlobRateLimitStore({
    connectionString: config.storageConnectionString!,
    containerName: config.rateLimitContainer,
  });
}

function buildQueue(config: Config): QueueClient {
  if (config.queueEndpoint) {
    return new QueueClient({
      endpoint: config.queueEndpoint,
      scriptGenQueue: config.scriptGenQueue,
      ttsSentenceQueue: config.ttsSentenceQueue,
    });
  }
  return new QueueClient({
    connectionString: config.storageConnectionString!,
    scriptGenQueue: config.scriptGenQueue,
    ttsSentenceQueue: config.ttsSentenceQueue,
  });
}

export function getContext(): ApiContext {
  if (cached) return cached;
  const config = loadConfig();
  cached = {
    config,
    lessons: buildLessons(config),
    audio: buildAudio(config),
    queue: buildQueue(config),
    llm: buildLlm(config),
    tts: buildTts(config),
    rateLimits: buildRateLimits(config),
    telemetry: createTelemetry({ connectionString: config.appInsightsConnectionString }),
  };
  return cached;
}

export function setContextForTests(override: ApiContext | undefined): void {
  cached = override;
}
