/**
 * Deterministic JSON serialization: object keys sorted recursively and
 * `undefined` values dropped, so equivalent params always produce the same
 * string (and therefore the same lesson id) regardless of key order.
 *
 * NOTE: must stay byte-for-byte identical to the API's copy
 * (src/api/src/_shared/canonicalize.ts) — both feed the same SHA-256 id.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sort(value));
}

function sort(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sort);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(v as Record<string, unknown>).sort()) {
    const val = (v as Record<string, unknown>)[key];
    if (val === undefined) continue;
    out[key] = sort(val);
  }
  return out;
}
