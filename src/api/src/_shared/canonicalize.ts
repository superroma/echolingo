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
