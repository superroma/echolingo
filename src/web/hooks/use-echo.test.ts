import { describe, it, expect } from 'vitest';
import { decidePoll, MAX_CONSECUTIVE_ERRORS } from './use-echo.js';
import type { Echo } from '@echolingo/shared/types';

function echo(status: Echo['status']): Echo {
  return {
    id: 'x',
    params: {
      topic: 't',
      targetLang: 'el',
      nativeLang: 'en',
      lengthMin: 5,
      level: 3,
      mode: 'bilingual',
      bilingualOrder: 'target_first',
      ttsEngine: 'openai',
    },
    status,
    createdAt: '',
    updatedAt: '',
    totalSentences: 0,
    readySentences: 0,
    sentences: [],
  };
}

describe('decidePoll', () => {
  it('keeps polling while generating', () => {
    const d = decidePoll({ kind: 'found', echo: echo('generating_audio') }, 0);
    expect(d.continuePolling).toBe(true);
    expect(d.state).toEqual({ kind: 'ok', echo: echo('generating_audio') });
  });

  it('stops once the echo is ready', () => {
    const d = decidePoll({ kind: 'found', echo: echo('ready') }, 3);
    expect(d.continuePolling).toBe(false);
    expect(d.state?.kind).toBe('ok');
    expect(d.consecutiveErrors).toBe(0); // a success resets the failure streak
  });

  it('does NOT freeze on a transient error — keeps polling, no state change', () => {
    const d = decidePoll({ kind: 'error', status: 0, message: 'network error' }, 0);
    expect(d.continuePolling).toBe(true);
    expect(d.state).toBeUndefined();
    expect(d.consecutiveErrors).toBe(1);
  });

  it('a transient error mid-generation then a ready poll still resolves', () => {
    // simulate: error (streak 1) -> keep polling -> ready -> stop
    const afterError = decidePoll({ kind: 'error', status: 503, message: 'cold' }, 0);
    expect(afterError.continuePolling).toBe(true);
    const afterReady = decidePoll({ kind: 'found', echo: echo('ready') }, afterError.consecutiveErrors);
    expect(afterReady.continuePolling).toBe(false);
    expect(afterReady.state).toEqual({ kind: 'ok', echo: echo('ready') });
  });

  it('surfaces an error only after sustained consecutive failures', () => {
    const d = decidePoll({ kind: 'error', status: 500, message: 'down' }, MAX_CONSECUTIVE_ERRORS - 1);
    expect(d.continuePolling).toBe(false);
    expect(d.state).toEqual({ kind: 'error', message: 'down' });
  });

  it('treats not_found as terminal', () => {
    const d = decidePoll({ kind: 'not_found' }, 0);
    expect(d.continuePolling).toBe(false);
    expect(d.state).toEqual({ kind: 'not_found' });
  });
});
