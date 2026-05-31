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
 * The playlist to actually play. When a bilingual echo has its translation
 * turned off, the native-language audio is dropped (not just hidden in the
 * transcript) so it isn't read aloud. Target-only echoes are unaffected.
 */
export function playablePlaylist(echo: Echo, includeTranslation: boolean): PlaylistEntry[] {
  const full = buildPlaylist(echo);
  if (echo.params.mode === 'bilingual' && !includeTranslation) {
    return full.filter((e) => e.lang === 'gr');
  }
  return full;
}
