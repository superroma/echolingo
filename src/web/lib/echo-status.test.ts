import { describe, it, expect } from 'vitest';
import { statusLine } from './echo-status.js';
import type { Echo, EchoStatus } from '@echolingo/shared/types';

function echo(status: EchoStatus, ready: number, total: number): Echo {
  return {
    id: 'x',
    params: {
      topic: 't', targetLang: 'el', nativeLang: 'en',
      lengthMin: 5, level: 3, mode: 'bilingual', bilingualOrder: 'target_first', ttsEngine: 'openai',
    },
    status, createdAt: '', updatedAt: '', totalSentences: total, readySentences: ready, sentences: [],
  };
}

describe('statusLine', () => {
  it('announces script writing', () => {
    expect(statusLine(echo('generating_script', 0, 0))).toBe('writing the script…');
  });
  it('counts audio progress', () => {
    expect(statusLine(echo('generating_audio', 2, 8))).toBe('recording audio · 2/8');
  });
  it('is empty once ready', () => {
    expect(statusLine(echo('ready', 8, 8))).toBe('');
  });
});
