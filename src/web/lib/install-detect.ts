export type InstallPlatform = 'ios' | 'android' | 'other';

/**
 * Best-effort platform classification from the user agent. iPadOS 13+ reports a
 * desktop ("Macintosh") UA, so we treat a touch-capable Mac as iOS too.
 */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}

/**
 * True when the app is running as an installed PWA rather than a browser tab.
 * `display-mode: standalone` covers Android/desktop; `navigator.standalone`
 * is iOS Safari's own flag.
 */
export function isStandalone(env: {
  standaloneMatch: boolean;
  navigatorStandalone?: boolean;
}): boolean {
  return env.standaloneMatch || env.navigatorStandalone === true;
}

/** Dismissing the install panel suppresses it for this long (one week). */
export const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * True when a stored dismissal timestamp is still within the suppression
 * window — i.e. the panel was dismissed less than a week ago and should stay
 * hidden. Returns false for missing/invalid timestamps.
 */
export function isDismissActive(dismissedAtMs: number | null, nowMs: number): boolean {
  if (dismissedAtMs === null || !Number.isFinite(dismissedAtMs)) return false;
  return nowMs - dismissedAtMs < INSTALL_DISMISS_MS;
}
