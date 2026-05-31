// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readIdFromPath } from './echo-by-id-client';

describe('readIdFromPath', () => {
  it('reads the first path segment as the id', () => {
    window.history.pushState({}, '', '/k7Xp2qB9');
    expect(readIdFromPath()).toBe('k7Xp2qB9');
  });
  it('returns empty string at root', () => {
    window.history.pushState({}, '', '/');
    expect(readIdFromPath()).toBe('');
  });
});
