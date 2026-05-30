import { canonicalize } from './canonicalize.js';
import type { LessonParams } from './types.js';

/**
 * Deterministic lesson id: SHA-256 (hex) of the canonicalized, topic-normalized
 * params. Isomorphic — uses Web Crypto (`crypto.subtle`), available in browsers
 * and Node 18+ — so the web can derive the *same* id the API assigns and link
 * straight to `/echo/{id}` without a round-trip. Async because `digest` is.
 *
 * Must match the API's `lessonId` (src/api/src/_shared/lesson-id.ts): same
 * normalization + same canonicalization → identical hash.
 */
export async function lessonId(params: LessonParams): Promise<string> {
  const normalized: LessonParams = {
    ...params,
    topic: params.topic.trim().toLowerCase().replace(/\s+/g, ' '),
  };
  const data = new TextEncoder().encode(canonicalize(normalized));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}
