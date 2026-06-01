'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PlaylistEntry } from '@echolingo/shared/types';

// useLayoutEffect on the client (runs before the passive src effect, so a
// playlist swap is remapped before any stale reload), useEffect on the server
// (avoids the SSR warning during static export).
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const SPEED_KEY = 'echo:speed';
export const posKey = (id: string) => `echo:pos:${id}`;

export function loadSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return v === 0.75 || v === 1 || v === 1.25 ? v : 1;
  } catch {
    return 1;
  }
}
export function saveSpeed(rate: number): void {
  try {
    localStorage.setItem(SPEED_KEY, String(rate));
  } catch {
    /* ignore */
  }
}
export function loadPosition(id: string): number {
  try {
    const v = Number(localStorage.getItem(posKey(id)));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}
export function savePosition(id: string, sec: number): void {
  try {
    localStorage.setItem(posKey(id), String(sec));
  } catch {
    /* ignore */
  }
}

export interface PlayerState {
  isPlaying: boolean;
  currentChunk: number;
  currentSentence: number;
  speed: number;
}

export interface PlayerControls {
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  prev(): void;
  repeatSentence(): void;
  jumpToSentence(sentenceIdx: number): void;
  setSpeed(rate: number): void;
}

export function usePlayer(playlist: PlaylistEntry[], echoId?: string): {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  state: PlayerState;
  controls: PlayerControls;
} {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(() => (typeof window !== 'undefined' ? loadSpeed() : 1));

  const currentSentence = useMemo(
    () => playlist[currentChunk]?.sentenceIndex ?? 0,
    [playlist, currentChunk],
  );

  // When the playlist is rebuilt mid-playback (e.g. toggling translation adds or
  // drops the native chunks), the raw currentChunk index no longer points at the
  // same audio. Remap it to the chunk that's actually playing — same URL, so the
  // src effect below won't reload — letting the current sentence finish instead
  // of restarting. This runs before the passive src effect, so the stale index
  // never triggers a reload. If the playing chunk was removed (translation turned
  // off while its translation was playing), advance to the next sentence.
  const prevPlaylistRef = useRef(playlist);
  useIsomorphicLayoutEffect(() => {
    const prev = prevPlaylistRef.current;
    if (prev === playlist) return;
    prevPlaylistRef.current = playlist;
    const playing = prev[currentChunk];
    if (!playing || playlist.length === 0) return;
    let idx = playlist.findIndex(
      (e) => e.sentenceIndex === playing.sentenceIndex && e.lang === playing.lang,
    );
    if (idx < 0) {
      idx = playlist.findIndex((e) => e.sentenceIndex > playing.sentenceIndex);
      if (idx < 0) idx = playlist.length - 1;
    }
    if (idx !== currentChunk) setCurrentChunk(idx);
  }, [playlist, currentChunk]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const entry = playlist[currentChunk];
    if (!entry) return;
    if (audio.src !== entry.url) {
      audio.src = entry.url;
      audio.load();
    }
    audio.playbackRate = speed;
  }, [playlist, currentChunk, speed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // Don't listen for 'pause' — load() and src changes fire transient pause
    // events that would falsely clear isPlaying mid-chunk-transition.
    // isPlaying is set false explicitly by the pause() control or at end of playlist.
    const onPlay = () => setIsPlaying(true);
    const onEnded = () => {
      setCurrentChunk((c) => Math.min(c + 1, playlist.length));
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('ended', onEnded);
    };
  }, [playlist.length]);

  useEffect(() => {
    if (!isPlaying) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (currentChunk >= playlist.length) {
      setIsPlaying(false);
      return;
    }
    void audio.play().catch(() => setIsPlaying(false));
  }, [currentChunk, isPlaying, playlist.length]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentChunk >= playlist.length) setCurrentChunk(0);
    void audio.play().catch(() => setIsPlaying(false));
  }, [currentChunk, playlist.length]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) play();
    else pause();
  }, [play, pause]);

  const next = useCallback(() => {
    let target = currentChunk + 1;
    while (
      target < playlist.length &&
      playlist[target]!.sentenceIndex === playlist[currentChunk]?.sentenceIndex
    ) {
      target += 1;
    }
    setCurrentChunk(Math.min(target, playlist.length));
  }, [currentChunk, playlist]);

  const prev = useCallback(() => {
    const currentSentenceIdx = playlist[currentChunk]?.sentenceIndex ?? 0;
    let target = currentChunk;
    while (target > 0 && playlist[target - 1]!.sentenceIndex === currentSentenceIdx) {
      target -= 1;
    }
    if (target === currentChunk && target > 0) {
      const prevSentenceIdx = playlist[target - 1]!.sentenceIndex;
      target -= 1;
      while (target > 0 && playlist[target - 1]!.sentenceIndex === prevSentenceIdx) {
        target -= 1;
      }
    }
    setCurrentChunk(target);
  }, [currentChunk, playlist]);

  const jumpToSentence = useCallback(
    (sentenceIdx: number) => {
      const target = playlist.findIndex((e) => e.sentenceIndex === sentenceIdx);
      if (target >= 0) setCurrentChunk(target);
    },
    [playlist],
  );

  const repeatSentence = useCallback(() => {
    const currentSentenceIdx = playlist[currentChunk]?.sentenceIndex ?? 0;
    let target = currentChunk;
    while (target > 0 && playlist[target - 1]!.sentenceIndex === currentSentenceIdx) {
      target -= 1;
    }
    setCurrentChunk(target);
  }, [currentChunk, playlist]);

  const setSpeed = useCallback((rate: number) => {
    setSpeedState(rate);
    saveSpeed(rate);
  }, []);

  // Persist playback position so reopening an echo resumes where it left off.
  // Depend on playlist.length too: the <audio> element mounts only once the
  // echo is ready (loading -> ready), so this must re-run when the playlist
  // fills (0 -> N) to bind the listener to the now-present element. Without it,
  // the effect runs once with a null ref, never rebinds, and no position is ever
  // saved — which made every echo show as "new" forever.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !echoId) return;
    const onTime = () => {
      if (audio.currentTime > 0) savePosition(echoId, audio.currentTime);
    };
    audio.addEventListener('timeupdate', onTime);
    return () => audio.removeEventListener('timeupdate', onTime);
  }, [echoId, playlist.length]);

  // MediaSession integration (lockscreen / Now-Playing controls)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const entry = playlist[currentChunk];
    if (!entry) {
      ms.metadata = null;
      return;
    }
    ms.metadata = new MediaMetadata({
      title: `Sentence ${entry.sentenceIndex + 1}`,
      artist: 'Echolingo',
      album: 'Echolingo',
    });
    ms.setActionHandler('play', () => play());
    ms.setActionHandler('pause', () => pause());
    ms.setActionHandler('nexttrack', () => next());
    ms.setActionHandler('previoustrack', () => prev());
    return () => {
      ms.setActionHandler('play', null);
      ms.setActionHandler('pause', null);
      ms.setActionHandler('nexttrack', null);
      ms.setActionHandler('previoustrack', null);
    };
  }, [currentChunk, playlist, play, pause, next, prev]);

  return {
    audioRef,
    state: { isPlaying, currentChunk, currentSentence, speed },
    controls: { play, pause, toggle, next, prev, repeatSentence, jumpToSentence, setSpeed },
  };
}
