// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

beforeEach(() => {
  push.mockReset();
  localStorage.clear();
});

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

describe('EchoesList row interactions', () => {
  it('navigates to the echo when the row is clicked', () => {
    render(<EchoesList echoes={[echo]} hydrated onRemove={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open echo: Ordering coffee' }));
    expect(push).toHaveBeenCalledWith('/e1/');
  });

  it('removes via the swipe-revealed Delete button (no confirm)', () => {
    vi.useFakeTimers();
    const onRemove = vi.fn();
    try {
      render(<EchoesList echoes={[echo]} hydrated onRemove={onRemove} />);
      // The action is aria-hidden until swiped open, so query by its text.
      fireEvent.click(screen.getByText('Delete'));
      vi.advanceTimersByTime(200); // slide-out then remove
      expect(onRemove).toHaveBeenCalledWith('e1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('confirms before removing via the hover × button', () => {
    const onRemove = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EchoesList echoes={[echo]} hydrated onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove echo' }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
