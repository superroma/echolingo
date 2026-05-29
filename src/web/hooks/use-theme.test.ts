import { describe, it, expect } from 'vitest';
import { resolveEffective, nextOverride } from './use-theme';

describe('resolveEffective', () => {
  it('follows the system when mode is auto', () => {
    expect(resolveEffective('auto', true)).toBe('dark');
    expect(resolveEffective('auto', false)).toBe('light');
  });
  it('honors an explicit override', () => {
    expect(resolveEffective('light', true)).toBe('light');
    expect(resolveEffective('dark', false)).toBe('dark');
  });
});

describe('nextOverride', () => {
  it('pins the opposite of the current effective theme', () => {
    expect(nextOverride('light')).toBe('dark');
    expect(nextOverride('dark')).toBe('light');
  });
});
