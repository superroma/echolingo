import { createHash } from 'node:crypto';
import { canonicalize } from './canonicalize.js';
import type { EchoParams } from './types.js';

export function echoId(params: EchoParams): string {
  const normalized: EchoParams = {
    ...params,
    topic: params.topic.trim().toLowerCase().replace(/\s+/g, ' '),
  };
  return createHash('sha256').update(canonicalize(normalized)).digest('hex');
}
