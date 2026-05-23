'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlaylistEntry } from '@echolingo/shared/types';

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

export function usePlayer(playlist: PlaylistEntry[]): {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  state: PlayerState;
  controls: PlayerControls;
} {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);

  const currentSentence = useMemo(
    () => playlist[currentChunk]?.sentenceIndex ?? 0,
    [playlist, currentChunk],
  );

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
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setCurrentChunk((c) => Math.min(c + 1, playlist.length));
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
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
  }, []);

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
      album: 'Greek lesson',
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
