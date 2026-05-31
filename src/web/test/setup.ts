import { afterEach, vi } from 'vitest';

// Everything here is DOM-only. Guarding on `window` means this setup file is a
// no-op for node-env tests, so they keep running exactly as before.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');

  // jsdom doesn't implement HTMLMediaElement playback methods.
  for (const method of ['play', 'pause', 'load'] as const) {
    Object.defineProperty(HTMLMediaElement.prototype, method, {
      configurable: true,
      value: method === 'play' ? vi.fn().mockResolvedValue(undefined) : vi.fn(),
    });
  }

  // use-theme reads matchMedia on mount; jsdom doesn't provide it.
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });
}
