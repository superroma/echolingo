// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useEcho, type UseEchoIO } from './use-echo.js';
import type { Echo } from '@echolingo/shared/types';

function echo(topic: string): Echo {
  return {
    id: 'abc',
    params: {
      topic, targetLang: 'el', nativeLang: 'en',
      lengthMin: 5, level: 3, mode: 'bilingual', bilingualOrder: 'target_first', ttsEngine: 'openai',
    },
    status: 'ready', createdAt: 'x', updatedAt: 'x', totalSentences: 1, readySentences: 1,
    sentences: [{ i: 0, gr: 'g', native: 'n', status: 'ready', grUrl: 'u', nativeUrl: 'v', grDurSec: 1, nativeDurSec: 1 }],
  };
}

function Probe({ io }: { io: UseEchoIO }) {
  const s = useEcho('abc', 0, io);
  return <div data-testid="state">{s.kind === 'ok' ? `ok:${s.echo.params.topic}` : s.kind}</div>;
}

describe('useEcho offline behavior', () => {
  it('shows the cached echo when the network is down', async () => {
    const cached = echo('cached');
    const io: UseEchoIO = {
      getEcho: async () => { throw new Error('offline'); },
      saveEcho: () => {},
      loadEcho: () => cached,
    };
    render(<Probe io={io} />);
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ok:cached'));
  });

  it('saves a found echo for offline replay', async () => {
    const live = echo('live');
    const saved: Echo[] = [];
    const io: UseEchoIO = {
      getEcho: async () => ({ kind: 'found', echo: live }),
      saveEcho: (e) => void saved.push(e),
      loadEcho: () => null,
    };
    render(<Probe io={io} />);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.params.topic).toBe('live');
  });
});
