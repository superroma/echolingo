import { canonicalize } from './canonicalize.js';
import type { EchoParams } from './types.js';

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Deterministic short echo id: base62 of the first 8 bytes of SHA-256(canonical
 * params), reduced into exactly 8 base62 chars (~47.6 bits). Isomorphic (Web
 * Crypto), so the web mints the same id everywhere. The API does not recompute
 * it — it only validates the shape (isEchoId).
 */
export async function echoId(params: EchoParams): Promise<string> {
  const normalized: EchoParams = {
    ...params,
    topic: params.topic.trim().toLowerCase().replace(/\s+/g, ' '),
  };
  const data = new TextEncoder().encode(canonicalize(normalized));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));

  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(digest[i]!);
  n %= 62n ** 8n;

  let out = '';
  for (let i = 0; i < 8; i++) { out = B62[Number(n % 62n)] + out; n /= 62n; }
  return out;
}
