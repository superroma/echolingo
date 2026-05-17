import { describe, it, expect } from 'vitest';
import { concatMp3 } from '../src/lib/concat-mp3.js';

describe('concatMp3', () => {
  it('concatenates buffers in order', () => {
    const result = concatMp3([Buffer.from('aaa'), Buffer.from('bbb'), Buffer.from('cc')]);
    expect(result.toString('utf-8')).toBe('aaabbbcc');
    expect(result.length).toBe(8);
  });

  it('returns an empty buffer for an empty input array', () => {
    expect(concatMp3([]).length).toBe(0);
  });

  it('skips null entries', () => {
    const result = concatMp3([Buffer.from('a'), null, Buffer.from('b')]);
    expect(result.toString('utf-8')).toBe('ab');
  });
});
