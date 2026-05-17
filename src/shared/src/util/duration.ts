const CHARS_PER_SECOND = 14;
const MIN_SECONDS = 0.3;

export function estimateMp3DurationSec(text: string): number {
  return Math.max(MIN_SECONDS, text.length / CHARS_PER_SECOND);
}
