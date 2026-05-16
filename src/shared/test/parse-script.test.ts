import { describe, it, expect } from 'vitest';
import { parseScript } from '../src/parse-script.js';

describe('parseScript', () => {
  it('parses GR||NATIVE pairs line by line', () => {
    const raw = ['Καλημέρα.||Good morning.', 'Πώς είσαι;||How are you?'].join('\n');
    expect(parseScript(raw)).toEqual([
      { i: 0, gr: 'Καλημέρα.', native: 'Good morning.', status: 'pending' },
      { i: 1, gr: 'Πώς είσαι;', native: 'How are you?', status: 'pending' },
    ]);
  });

  it('trims surrounding whitespace per sentence', () => {
    const raw = '  Καλημέρα.  ||   Good morning.   ';
    expect(parseScript(raw)[0]).toEqual({
      i: 0,
      gr: 'Καλημέρα.',
      native: 'Good morning.',
      status: 'pending',
    });
  });

  it('skips blank lines', () => {
    const raw = ['Καλημέρα.||Good morning.', '', '   ', 'Γεια.||Hi.'].join('\n');
    expect(parseScript(raw).map((s) => s.i)).toEqual([0, 1]);
  });

  it('skips lines that lack the separator', () => {
    const raw = ['Καλημέρα.||Good morning.', 'This line has no separator', 'Γεια.||Hi.'].join('\n');
    expect(parseScript(raw).map((s) => s.gr)).toEqual(['Καλημέρα.', 'Γεια.']);
  });

  it('skips lines where either side is empty after trim', () => {
    const raw = ['||Good morning.', 'Γεια.||', 'Καλημέρα.||Good morning.'].join('\n');
    expect(parseScript(raw)).toEqual([
      { i: 0, gr: 'Καλημέρα.', native: 'Good morning.', status: 'pending' },
    ]);
  });

  it('handles dialogue speaker prefixes by preserving them on both sides', () => {
    const raw = 'Maria: Καλημέρα.||Maria: Good morning.';
    expect(parseScript(raw)[0]).toEqual({
      i: 0,
      gr: 'Maria: Καλημέρα.',
      native: 'Maria: Good morning.',
      status: 'pending',
    });
  });

  it('reindexes sequentially even when invalid lines were skipped', () => {
    const raw = ['Καλημέρα.||Good morning.', 'bad line', 'Γεια.||Hi.', 'Πώς είσαι;||How are you?'].join('\n');
    expect(parseScript(raw).map((s) => s.i)).toEqual([0, 1, 2]);
  });
});
