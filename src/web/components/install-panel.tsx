'use client';

import { useInstallPrompt } from '../hooks/use-install-prompt';

/**
 * Shown only when Echolingo runs in a browser tab (not an installed PWA).
 * Android/desktop Chromium get a real Install button; iOS gets manual
 * Add-to-Home-Screen instructions. Dismissal is session-only.
 */
export function InstallPanel() {
  const { visible, platform, canPrompt, promptInstall, dismiss } = useInstallPrompt();
  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 top-14 z-20 px-3">
      <div className="relative mx-auto max-w-md rounded-[16px] border border-line bg-paper-2 px-4 py-3 pr-10 shadow-[var(--shadow-2)]">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-ink-mute hover:bg-paper-3 hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <p className="font-serif text-[17px] font-semibold text-ink">
          Add Echolingo to your home screen
        </p>

        {canPrompt ? (
          <>
            <p className="mt-1 text-sm text-ink-soft">
              Install it for full-screen, offline listening.
            </p>
            <button
              type="button"
              onClick={promptInstall}
              className="mt-3 rounded-pill bg-accent px-5 py-1.5 text-sm font-semibold text-accent-ink shadow-[var(--shadow-1)]"
            >
              Install
            </button>
          </>
        ) : platform === 'ios' ? (
          <p className="mt-1 text-sm text-ink-soft">
            Tap the Share button <ShareGlyph /> in the toolbar, then{' '}
            <span className="font-medium text-ink">Add to Home Screen</span>.
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">
            Open your browser menu and choose{' '}
            <span className="font-medium text-ink">Add to Home screen</span>.
          </p>
        )}
      </div>
    </div>
  );
}

/** iOS share icon (square with an upward arrow). */
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="inline-block h-4 w-4 -translate-y-px align-middle text-accent"
      fill="none"
      aria-hidden
    >
      <path
        d="M10 2.5v9M10 2.5L7 5.5M10 2.5l3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 8.5H4.75A1.25 1.25 0 003.5 9.75v6A1.25 1.25 0 004.75 17h10.5a1.25 1.25 0 001.25-1.25v-6A1.25 1.25 0 0015.25 8.5H14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
