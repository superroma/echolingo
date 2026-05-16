import { createHash } from 'node:crypto';
import { canonicalize } from './canonicalize.js';
import type { LessonParams } from './types.js';

export function lessonId(params: LessonParams): string {
  const normalized: LessonParams = {
    ...params,
    topic: params.topic.trim().toLowerCase().replace(/\s+/g, ' '),
  };
  return createHash('sha256').update(canonicalize(normalized)).digest('hex');
}
