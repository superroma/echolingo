import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, DEFAULT_ECHO_CONTAINER, DEFAULT_AUDIO_CONTAINER, DEFAULT_SCRIPT_GEN_QUEUE, DEFAULT_TTS_SENTENCE_QUEUE } from '../src/config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AzureWebJobsStorage;
    delete process.env.ECHOES_CONTAINER;
    delete process.env.AUDIO_CONTAINER;
    delete process.env.SCRIPT_GEN_QUEUE;
    delete process.env.TTS_SENTENCE_QUEUE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when AzureWebJobsStorage is unset', () => {
    expect(() => loadConfig()).toThrow(/AzureWebJobsStorage/);
  });

  it('returns the connection string from env', () => {
    process.env.AzureWebJobsStorage = 'UseDevelopmentStorage=true';
    expect(loadConfig().storageConnectionString).toBe('UseDevelopmentStorage=true');
  });

  it('uses default container and queue names when env is unset', () => {
    process.env.AzureWebJobsStorage = 'UseDevelopmentStorage=true';
    const cfg = loadConfig();
    expect(cfg.echoesContainer).toBe(DEFAULT_ECHO_CONTAINER);
    expect(cfg.audioContainer).toBe(DEFAULT_AUDIO_CONTAINER);
    expect(cfg.scriptGenQueue).toBe(DEFAULT_SCRIPT_GEN_QUEUE);
    expect(cfg.ttsSentenceQueue).toBe(DEFAULT_TTS_SENTENCE_QUEUE);
  });

  it('selects azurespeech and parses the speech config from env', () => {
    process.env.AzureWebJobsStorage = 'UseDevelopmentStorage=true';
    process.env.TTS_ENGINE = 'azurespeech';
    process.env.AZURE_SPEECH_REGION = 'westeurope';
    process.env.AZURE_SPEECH_RESOURCE_ID =
      '/subscriptions/x/resourceGroups/rg/providers/Microsoft.CognitiveServices/accounts/spch';
    const cfg = loadConfig();
    expect(cfg.ttsEngine).toBe('azurespeech');
    expect(cfg.speech?.region).toBe('westeurope');
    expect(cfg.speech?.resourceId).toContain('/accounts/spch');
  });

  it('throws when azurespeech is selected without speech env', () => {
    process.env.AzureWebJobsStorage = 'UseDevelopmentStorage=true';
    process.env.TTS_ENGINE = 'azurespeech';
    delete process.env.AZURE_SPEECH_REGION;
    delete process.env.AZURE_SPEECH_RESOURCE_ID;
    expect(() => loadConfig()).toThrow(/AZURE_SPEECH/);
  });

  it('honors env overrides for container and queue names', () => {
    process.env.AzureWebJobsStorage = 'UseDevelopmentStorage=true';
    process.env.ECHOES_CONTAINER = 'custom-echoes';
    process.env.AUDIO_CONTAINER = 'custom-audio';
    process.env.SCRIPT_GEN_QUEUE = 'custom-script-gen';
    process.env.TTS_SENTENCE_QUEUE = 'custom-tts';
    const cfg = loadConfig();
    expect(cfg.echoesContainer).toBe('custom-echoes');
    expect(cfg.audioContainer).toBe('custom-audio');
    expect(cfg.scriptGenQueue).toBe('custom-script-gen');
    expect(cfg.ttsSentenceQueue).toBe('custom-tts');
  });
});
