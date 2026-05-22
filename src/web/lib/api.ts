import type { Lesson, LessonParams } from '@echolingo/shared/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export type CreateLessonResult =
  | { kind: 'created'; id: string; status: string }
  | { kind: 'existing'; id: string; status: string }
  | { kind: 'rate_limited'; limit: number; used: number; resetAt: string }
  | { kind: 'error'; status: number; message: string };

export type GetLessonResult =
  | { kind: 'found'; lesson: Lesson }
  | { kind: 'not_found' }
  | { kind: 'error'; status: number; message: string };

export type DownloadLessonResult =
  | { kind: 'ready'; url: string }
  | { kind: 'not_ready'; message: string }
  | { kind: 'error'; status: number; message: string };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function createLesson(params: LessonParams): Promise<CreateLessonResult> {
  const res = await fetch(`${API_BASE_URL}/api/lesson`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await readJson(res);
  if (res.status === 201) {
    return { kind: 'created', id: String(body.id), status: String(body.status) };
  }
  if (res.status === 200) {
    return { kind: 'existing', id: String(body.id), status: String(body.status) };
  }
  if (res.status === 429) {
    return {
      kind: 'rate_limited',
      limit: Number(body.limit ?? 0),
      used: Number(body.used ?? 0),
      resetAt: String(body.resetAt ?? ''),
    };
  }
  return {
    kind: 'error',
    status: res.status,
    message: String(body.error ?? res.statusText),
  };
}

export async function getLesson(id: string): Promise<GetLessonResult> {
  const res = await fetch(`${API_BASE_URL}/api/lesson/${encodeURIComponent(id)}`);
  if (res.status === 404) return { kind: 'not_found' };
  const body = await readJson(res);
  if (res.status === 200) {
    return { kind: 'found', lesson: body as unknown as Lesson };
  }
  return {
    kind: 'error',
    status: res.status,
    message: String(body.error ?? res.statusText),
  };
}

export async function downloadLesson(id: string): Promise<DownloadLessonResult> {
  const res = await fetch(`${API_BASE_URL}/api/lesson/${encodeURIComponent(id)}/download`, { method: 'POST' });
  const body = await readJson(res);
  if (res.status === 200) {
    return { kind: 'ready', url: String(body.url) };
  }
  if (res.status === 409) {
    return { kind: 'not_ready', message: String(body.error ?? 'lesson not ready') };
  }
  return {
    kind: 'error',
    status: res.status,
    message: String(body.error ?? res.statusText),
  };
}
