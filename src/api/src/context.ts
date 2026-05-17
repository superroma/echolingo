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
import { QueueClient } from './queue/queue-client.js';

export interface ApiContext {
  config: Config;
  lessons: LessonRepository;
  audio: AudioStorage;
  queue: QueueClient;
  llm: LlmEngine;
  tts: TtsEngine;
}

let cached: ApiContext | undefined;

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
    llm: new MockLlmEngine(),
    tts: new MockTtsEngine(),
  };
  return cached;
}

export function setContextForTests(override: ApiContext | undefined): void {
  cached = override;
}
