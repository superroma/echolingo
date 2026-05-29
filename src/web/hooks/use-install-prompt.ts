'use client';

import { useEffect, useState } from 'react';
import { detectPlatform, isStandalone, type InstallPlatform } from '../lib/install-detect';

/** The non-standard event Chromium fires when a PWA is installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallPromptState {
  /** Show the install panel? False while installed, dismissed, or on the server. */
  visible: boolean;
  platform: InstallPlatform;
  /** A native install prompt is available (Android/desktop Chromium). */
  canPrompt: boolean;
  /** Trigger the captured native install prompt. No-op when unavailable. */
  promptInstall: () => void;
  /** Hide the panel for this session only — the choice is not remembered. */
  dismiss: () => void;
}

export function useInstallPrompt(): InstallPromptState {
  const [mounted, setMounted] = useState(false);
  // Session-only — deliberately NOT persisted, so the panel returns next visit.
  const [dismissed, setDismissed] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>('other');
  // Assume installed until the client proves otherwise, to avoid an SSR flash.
  const [standalone, setStandalone] = useState(true);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setMounted(true);
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
    setStandalone(
      isStandalone({
        standaloneMatch: window.matchMedia('(display-mode: standalone)').matches,
        navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
      }),
    );

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setStandalone(true);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const canPrompt = deferred !== null;
  const installable = platform === 'ios' || platform === 'android' || canPrompt;
  const visible = mounted && !standalone && !dismissed && installable;

  function promptInstall() {
    if (!deferred) return;
    void deferred.prompt();
    void deferred.userChoice.finally(() => setDeferred(null));
  }

  return {
    visible,
    platform,
    canPrompt,
    promptInstall,
    dismiss: () => setDismissed(true),
  };
}
