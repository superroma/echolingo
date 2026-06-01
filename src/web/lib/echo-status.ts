import type { Echo } from '@echolingo/shared/types';

/** One short line for the player dock describing what generation is doing. */
export function statusLine(echo: Echo): string {
  switch (echo.status) {
    case 'generating_script':
      return 'writing the script…';
    case 'generating_audio':
      return `recording audio · ${echo.readySentences}/${echo.totalSentences}`;
    default:
      return '';
  }
}
