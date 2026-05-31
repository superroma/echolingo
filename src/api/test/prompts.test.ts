import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../src/_shared/prompts.js';
import { echoParams } from './helpers/fixtures.js';

describe('buildPrompt — templated languages', () => {
  it('mentions target-language name in system message', () => {
    const { system } = buildPrompt(
      echoParams({ targetLang: 'es', nativeLang: 'en' }),
    );
    expect(system).toMatch(/Spanish/);
    expect(system).not.toMatch(/Greek/);
  });

  it('mentions native-language name in system message', () => {
    const { system } = buildPrompt(
      echoParams({ targetLang: 'el', nativeLang: 'ru' }),
    );
    expect(system).toMatch(/Russian/);
  });

  it('output-format uses target-lang uppercase tag for the first column', () => {
    const { user } = buildPrompt(
      echoParams({ targetLang: 'it', nativeLang: 'en' }),
    );
    expect(user).toMatch(/ITALIAN_SENTENCE\|\|ENGLISH_SENTENCE/);
  });

  it('still works for the Greek default fixture', () => {
    const { system, user } = buildPrompt(echoParams());
    expect(system).toMatch(/Greek language tutor/);
    expect(user).toMatch(/GREEK_SENTENCE\|\|ENGLISH_SENTENCE/);
  });
});

describe('buildPrompt — CEFR levels', () => {
  it('describes level 6 as CEFR C2', () => {
    const { user } = buildPrompt(echoParams({ level: 6 }));
    expect(user).toMatch(/C2/);
  });

  it('describes level 1 as CEFR A1', () => {
    const { user } = buildPrompt(echoParams({ level: 1 }));
    expect(user).toMatch(/A1/);
  });
});
