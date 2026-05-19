import {
  MockLlmEngine,
  MockTtsEngine,
  type AudioStorage,
  type LessonRepository,
  type LlmEngine,
  type TtsEngine,
} from '@echolingo/shared';
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

function buildLlm(config: Config): LlmEngine {
  if (config.llmEngine === 'openai') {
    if (!config.openai) throw new Error('openai config missing');
    return new OpenAiLlmEngine({
      auth: { kind: 'direct', apiKey: config.openai.apiKey },
      model: config.openai.llmModel,
    });
  }
  return new MockLlmEngine();
}

function buildTts(config: Config): TtsEngine {
  if (config.ttsEngine === 'openai') {
    if (!config.openai) throw new Error('openai config missing');
    return new OpenAiTtsEngine({
      auth: { kind: 'direct', apiKey: config.openai.apiKey },
      model: config.openai.ttsModel,
    });
  }
  return new MockTtsEngine();
}

export function getContext(): ApiContext {
  if (cached) return cached;
  const config = loadConfig();
  cached = {
    config,
    lessons: new BlobLessonRepository(config.storageConnectionString, config.lessonsContainer),
    audio: new BlobAudioStorage(config.storageConnectionString, config.audioContainer),
    queue: new QueueClient(
      config.storageConnectionString,
      config.scriptGenQueue,
      config.ttsSentenceQueue,
    ),
    llm: buildLlm(config),
    tts: buildTts(config),
    rateLimits: new BlobRateLimitStore(config.storageConnectionString, config.rateLimitContainer),
    telemetry: createTelemetry({ connectionString: config.appInsightsConnectionString }),
  };
  return cached;
}

export function setContextForTests(override: ApiContext | undefined): void {
  cached = override;
}
