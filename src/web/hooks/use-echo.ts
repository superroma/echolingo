'use client';

import { useEffect, useState } from 'react';
import type { Echo } from '@echolingo/shared/types';
import { getEcho, type GetEchoResult } from '../lib/api';

export type EchoState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; echo: Echo };

const POLL_INTERVAL_MS = 2000;
// A transient blip (dropped poll, cold-start 5xx, CORS hiccup) must not freeze
// the poller. Keep retrying; surface an error only after this many consecutive
// failures so a single bad poll can't strand the UI on "composing…" forever.
export const MAX_CONSECUTIVE_ERRORS = 5;

export interface PollDecision {
  /** New state to apply, if the result warrants one. */
  state?: EchoState;
  /** Whether to schedule another poll. */
  continuePolling: boolean;
  /** Running count of consecutive failures after this result. */
  consecutiveErrors: number;
}

/**
 * Pure poll state-machine. Terminal results (not_found, failed/ready echo,
 * sustained errors) stop polling; a generating echo or a transient error
 * keeps it going.
 */
export function decidePoll(result: GetEchoResult, prevErrors: number): PollDecision {
  if (result.kind === 'not_found') {
    return { state: { kind: 'not_found' }, continuePolling: false, consecutiveErrors: 0 };
  }
  if (result.kind === 'error') {
    const consecutiveErrors = prevErrors + 1;
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      return { state: { kind: 'error', message: result.message }, continuePolling: false, consecutiveErrors };
    }
    return { continuePolling: true, consecutiveErrors };
  }
  const s = result.echo.status;
  const generating = s === 'generating_script' || s === 'generating_audio';
  return { state: { kind: 'ok', echo: result.echo }, continuePolling: generating, consecutiveErrors: 0 };
}

export function useEcho(id: string, reloadToken = 0): EchoState {
  const [state, setState] = useState<EchoState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;

    async function tick() {
      let result: GetEchoResult;
      try {
        result = await getEcho(id);
      } catch {
        // fetch rejected (network/CORS) — treat as a transient error.
        result = { kind: 'error', status: 0, message: 'network error' };
      }
      if (cancelled) return;

      const decision = decidePoll(result, consecutiveErrors);
      consecutiveErrors = decision.consecutiveErrors;
      if (decision.state) setState(decision.state);
      if (decision.continuePolling && !cancelled) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, reloadToken]);

  return state;
}
