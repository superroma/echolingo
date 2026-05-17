export function concatMp3(parts: Array<Buffer | null>): Buffer {
  const filtered = parts.filter((p): p is Buffer => p != null);
  return filtered.length === 0 ? Buffer.alloc(0) : Buffer.concat(filtered);
}
