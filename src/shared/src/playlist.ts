import type { Echo } from './types.js';

export type AudioLang = 'gr' | 'native';

export interface PlaylistEntry {
  sentenceIndex: number;
  lang: AudioLang;
  url: string;
  durationSec: number;
}

export function buildPlaylist(echo: Echo): PlaylistEntry[] {
  const out: PlaylistEntry[] = [];
  const mode = echo.params.mode;
  const order = echo.params.bilingualOrder;

  for (const s of echo.sentences) {
    if (s.status !== 'ready') continue;

    const grEntry: PlaylistEntry | null = s.grUrl
      ? {
          sentenceIndex: s.i,
          lang: 'gr',
          url: s.grUrl,
          durationSec: s.grDurSec ?? 0,
        }
      : null;
    const nativeEntry: PlaylistEntry | null = s.nativeUrl
      ? {
          sentenceIndex: s.i,
          lang: 'native',
          url: s.nativeUrl,
          durationSec: s.nativeDurSec ?? 0,
        }
      : null;

    if (mode === 'target_only') {
      if (grEntry) out.push(grEntry);
      continue;
    }
    const first = order === 'target_first' ? grEntry : nativeEntry;
    const second = order === 'target_first' ? nativeEntry : grEntry;
    if (first) out.push(first);
    if (second) out.push(second);
  }
  return out;
}

/**
 * The playable frontier: the index of the first sentence still awaiting audio
 * (`status: 'pending'`). Sentences before it are resolved — `ready` ones are
 * playable, `failed` ones are skipped but do NOT block. Equals `sentences.length`
 * when nothing is pending. Playing only this contiguous prefix keeps a story
 * gap-free: it never skips a sentence whose audio hasn't arrived yet.
 */
export function playableThrough(echo: Echo): number {
  const pending = echo.sentences.findIndex((s) => s.status === 'pending');
  return pending === -1 ? echo.sentences.length : pending;
}

/**
 * The playlist to actually play: the contiguous non-pending prefix (see
 * {@link playableThrough}). When a bilingual echo has its translation turned
 * off, the native-language audio is dropped (not just hidden) so it isn't read
 * aloud. Target-only echoes are unaffected.
 */
export function playablePlaylist(echo: Echo, includeTranslation: boolean): PlaylistEntry[] {
  const frontier = playableThrough(echo);
  const prefix: Echo = { ...echo, sentences: echo.sentences.slice(0, frontier) };
  const full = buildPlaylist(prefix);
  if (echo.params.mode === 'bilingual' && !includeTranslation) {
    return full.filter((e) => e.lang === 'gr');
  }
  return full;
}
