// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptView } from './transcript-view.js';
import type { Echo } from '@echolingo/shared/types';

function readyEcho(sentenceCount: number): Echo {
  return {
    id: 't',
    status: 'ready',
    params: {
      topic: 'Ordering coffee',
      targetLang: 'el',
      nativeLang: 'en',
      lengthMin: 5,
      level: 3,
      mode: 'bilingual',
      bilingualOrder: 'target_first',
      ttsEngine: 'openai',
    },
    createdAt: '',
    updatedAt: '',
    totalSentences: sentenceCount,
    readySentences: sentenceCount,
    sentences: Array.from({ length: sentenceCount }, (_, i) => ({
      i,
      gr: `target ${i}`,
      native: `native ${i}`,
      status: 'ready' as const,
      grUrl: '',
      nativeUrl: '',
      grDurSec: 1,
      nativeDurSec: 1,
    })),
  } as Echo;
}

// Mirrors the scroll nesting in echo-client.tsx:
//   <div overflow-y-auto>   ← the real scroll container
//     <div max-w-2xl>       ← a layout wrapper (this is the <ol>'s parentElement)
//       <TranscriptView/>   ← renders the <ol>
function Player({ current }: { current: number }) {
  return (
    <div data-testid="scroller" style={{ overflowY: 'auto' }}>
      <div data-testid="wrapper">
        <TranscriptView
          echo={readyEcho(20)}
          currentSentence={current}
          showNative
          onJump={() => {}}
        />
      </div>
    </div>
  );
}

// jsdom has no layout/scroll engine, so we verify the behavior at its seam: when
// the current sentence advances, the *scroll container* must be scrolled (or the
// active line scrolled into view). TranscriptView's scrollBox() uses the <ol>'s
// parentElement — the non-scrolling max-w-2xl wrapper — so nothing happens and
// the current line drifts below the fold. Expected to FAIL until scrollBox()
// targets the nearest scrollable ancestor.
describe('TranscriptView keeps the current sentence in view', () => {
  const scrollIntoView = vi.fn();
  beforeEach(() => {
    scrollIntoView.mockReset();
    // jsdom implements none of these; install no-op stubs so the effect can run.
    HTMLElement.prototype.scrollBy = vi.fn();
    HTMLElement.prototype.scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  it('scrolls the scroll container when the current sentence changes', () => {
    const { rerender } = render(<Player current={0} />);

    // Track scrolls on the real scroll container specifically.
    const scrolledContainer = vi.fn();
    const scroller = screen.getByTestId('scroller');
    scroller.scrollBy = scrolledContainer;
    scroller.scrollTo = scrolledContainer;

    rerender(<Player current={12} />);

    const movedTheView =
      scrolledContainer.mock.calls.length + scrollIntoView.mock.calls.length;
    expect(movedTheView).toBeGreaterThan(0);
  });
});
