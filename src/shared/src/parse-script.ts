import type { Sentence } from './types.js';

const SEPARATOR = '||';

export function parseScript(raw: string): Sentence[] {
  const sentences: Sentence[] = [];
  let i = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const sepIndex = trimmed.indexOf(SEPARATOR);
    if (sepIndex === -1) continue;
    const gr = trimmed.slice(0, sepIndex).trim();
    const native = trimmed.slice(sepIndex + SEPARATOR.length).trim();
    if (gr.length === 0 || native.length === 0) continue;
    sentences.push({ i, gr, native, status: 'pending' });
    i += 1;
  }
  return sentences;
}
