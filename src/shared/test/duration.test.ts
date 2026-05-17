import { describe, it, expect } from 'vitest';
import { estimateMp3DurationSec } from '../src/util/duration.js';

describe('estimateMp3DurationSec', () => {
  it('scales linearly with text length', () => {
    const short = estimateMp3DurationSec('Γεια.');
    const long = estimateMp3DurationSec(
      'Καλημέρα σε όλους, πώς είστε σήμερα το πρωί;',
    );
    expect(long).toBeGreaterThan(short);
  });

  it('has a minimum floor for tiny inputs', () => {
    expect(estimateMp3DurationSec('Α')).toBeGreaterThanOrEqual(0.3);
    expect(estimateMp3DurationSec('')).toBeGreaterThanOrEqual(0.3);
  });

  it('produces ~3s for a 40-char sentence', () => {
    const d = estimateMp3DurationSec('Σήμερα μιλάμε για ένα νέο θέμα σήμερα.');
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(5);
  });
});
