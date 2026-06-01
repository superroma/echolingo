'use client';

import { useEffect, useState } from 'react';
import type { Echo } from '@echolingo/shared/types';
import { getEcho, type GetEchoResult } from '../lib/api';
import { saveEcho as saveEchoToCache, loadEcho as loadEchoFromCache } from '../lib/offline-echo';

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

export interface UseEchoIO {
  getEcho: (id: string) => Promise<GetEchoResult>;
  saveEcho: (echo: Echo) => void;
  loadEcho: (id: string) => Echo | null;
}

const defaultIO: UseEchoIO = {
  getEcho,
  saveEcho: saveEchoToCache,
  loadEcho: loadEchoFromCache,
};

export function useEcho(id: string, reloadToken = 0, io: UseEchoIO = defaultIO): EchoState {
  const [state, setState] = useState<EchoState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;
    let servedOk = false; // showed a good echo (live or cached) — don't clobber it with an error card

    async function tick() {
      let result: GetEchoResult;
      try {
        result = await io.getEcho(id);
      } catch {
        result = { kind: 'error', status: 0, message: 'network error' };
      }
      if (cancelled) return;

      // Keep a copy for offline replay once the script (and its URLs) exist.
      if (result.kind === 'found' && result.echo.sentences.length > 0) {
        io.saveEcho(result.echo);
      }

      const decision = decidePoll(result, consecutiveErrors);
      consecutiveErrors = decision.consecutiveErrors;

      // Network down and nothing good shown yet — fall back to the cached copy.
      if (result.kind === 'error' && !servedOk) {
        const cached = io.loadEcho(id);
        if (cached) {
          setState({ kind: 'ok', echo: cached });
          servedOk = true;
        }
      }

      if (decision.state) {
        const isErrorCard = decision.state.kind === 'error';
        if (!(servedOk && isErrorCard)) setState(decision.state);
        if (decision.state.kind === 'ok') servedOk = true;
      }

      if (decision.continuePolling && !cancelled) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, reloadToken, io]);

  return state;
}
