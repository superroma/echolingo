// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { EchoesList } from './echoes-list.js';
import type { Echo } from '../hooks/use-echoes.js';
import { posKey } from '../hooks/use-player.js';

const echo: Echo = {
  id: 'e1',
  topic: 'Ordering coffee',
  targetLang: 'el',
  nativeLang: 'en',
  lengthMin: 5,
  level: 3,
  createdAt: new Date().toISOString(),
  lastStatus: 'ready',
};

// Guards the read side of the "new" badge: it is purely a function of the saved
// listening position under echo:pos:<id>. This contract is correct today; the
// bug lives on the write side (see use-player.persistence.test.tsx).
describe('EchoesList "new" badge', () => {
  it('shows "new" when there is no saved listening position', () => {
    render(<EchoesList echoes={[echo]} hydrated onRemove={() => {}} />);
    expect(screen.getByText('new')).toBeInTheDocument();
  });

  it('hides "new" once a listening position is saved', () => {
    localStorage.setItem(posKey('e1'), '42');
    render(<EchoesList echoes={[echo]} hydrated onRemove={() => {}} />);
    expect(screen.queryByText('new')).not.toBeInTheDocument();
  });
});
