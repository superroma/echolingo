import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig — engine selection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { AzureWebJobsStorage: 'UseDevelopmentStorage=true' };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults llmEngine to "mock" when OPENAI_API_KEY is unset', () => {
    expect(loadConfig().llmEngine).toBe('mock');
  });

  it('defaults llmEngine to "openai" when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-x';
    expect(loadConfig().llmEngine).toBe('openai');
  });

  it('honors LLM_ENGINE=mock even when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-x';
    process.env.LLM_ENGINE = 'mock';
    expect(loadConfig().llmEngine).toBe('mock');
  });

  it('exposes openai keys when set', () => {
    process.env.OPENAI_API_KEY = 'sk-x';
    process.env.OPENAI_LLM_MODEL = 'gpt-4o-mini';
    process.env.OPENAI_TTS_MODEL = 'tts-1';
    const cfg = loadConfig();
    expect(cfg.openai?.apiKey).toBe('sk-x');
    expect(cfg.openai?.llmModel).toBe('gpt-4o-mini');
    expect(cfg.openai?.ttsModel).toBe('tts-1');
  });

  it('defaults ttsEngine to mock when no provider env is set', () => {
    expect(loadConfig().ttsEngine).toBe('mock');
  });

  it('defaults ttsEngine to openai when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-x';
    expect(loadConfig().ttsEngine).toBe('openai');
  });

  it('throws when LLM_ENGINE=openai but OPENAI_API_KEY missing', () => {
    process.env.LLM_ENGINE = 'openai';
    expect(() => loadConfig()).toThrow(/OPENAI_API_KEY/);
  });

  it('exposes rateLimitContainer with default', () => {
    expect(loadConfig().rateLimitContainer).toBe('rate-limits');
  });

  it('exposes rateLimitPerDay (default 20, env override)', () => {
    expect(loadConfig().rateLimitPerDay).toBe(20);
    process.env.RATE_LIMIT_PER_DAY = '5';
    expect(loadConfig().rateLimitPerDay).toBe(5);
  });

  it('exposes appInsightsConnectionString when set', () => {
    expect(loadConfig().appInsightsConnectionString).toBeUndefined();
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test';
    expect(loadConfig().appInsightsConnectionString).toBe('InstrumentationKey=test');
  });
});
