import { describe, it, expect } from 'vitest';
import {
  detectPlatform,
  isStandalone,
  isDismissActive,
  INSTALL_DISMISS_MS,
} from './install-detect.js';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

describe('detectPlatform', () => {
  it('classifies iPhone as ios', () => {
    expect(detectPlatform(IPHONE)).toBe('ios');
  });

  it('classifies iPad as ios', () => {
    expect(detectPlatform(IPAD)).toBe('ios');
  });

  it('classifies a touch-capable Mac (iPadOS desktop UA) as ios', () => {
    expect(detectPlatform(MAC, 5)).toBe('ios');
  });

  it('classifies a non-touch Mac as other', () => {
    expect(detectPlatform(MAC, 0)).toBe('other');
  });

  it('classifies Android as android', () => {
    expect(detectPlatform(ANDROID)).toBe('android');
  });

  it('classifies desktop Windows as other', () => {
    expect(detectPlatform(WINDOWS)).toBe('other');
  });
});

describe('isStandalone', () => {
  it('is true when display-mode matches standalone', () => {
    expect(isStandalone({ standaloneMatch: true })).toBe(true);
  });

  it('is true when iOS navigator.standalone is set', () => {
    expect(isStandalone({ standaloneMatch: false, navigatorStandalone: true })).toBe(true);
  });

  it('is false in a plain browser tab', () => {
    expect(isStandalone({ standaloneMatch: false, navigatorStandalone: false })).toBe(false);
  });

  it('is false when navigator.standalone is undefined and display-mode does not match', () => {
    expect(isStandalone({ standaloneMatch: false })).toBe(false);
  });
});

describe('isDismissActive', () => {
  const now = 1_780_000_000_000;

  it('is false when never dismissed', () => {
    expect(isDismissActive(null, now)).toBe(false);
  });

  it('is false for an invalid timestamp', () => {
    expect(isDismissActive(NaN, now)).toBe(false);
  });

  it('is true within the week-long window', () => {
    expect(isDismissActive(now - INSTALL_DISMISS_MS + 1000, now)).toBe(true);
    expect(isDismissActive(now - 1000, now)).toBe(true);
  });

  it('is false once the week has elapsed', () => {
    expect(isDismissActive(now - INSTALL_DISMISS_MS, now)).toBe(false);
    expect(isDismissActive(now - INSTALL_DISMISS_MS - 1000, now)).toBe(false);
  });
});
