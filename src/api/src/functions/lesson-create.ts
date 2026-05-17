import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { isLessonParams, lessonId, type Lesson } from '@echolingo/shared';
import { getContext } from '../context.js';

export async function lessonCreateHandler(req: HttpRequest): Promise<HttpResponseInit> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON body' });
  }

  if (!isLessonParams(body)) {
    return json(400, { error: 'invalid LessonParams' });
  }

  const ctx = getContext();
  const id = lessonId(body);

  const existing = await ctx.lessons.get(id);
  if (existing) {
    return json(200, { id, status: existing.status });
  }

  const now = new Date().toISOString();
  const fresh: Lesson = {
    id,
    params: body,
    status: 'generating_script',
    createdAt: now,
    updatedAt: now,
    totalSentences: 0,
    readySentences: 0,
    sentences: [],
  };

  const persisted = await ctx.lessons.createIfAbsent(fresh);
  // If another caller raced us, do not enqueue and return 200.
  if (persisted.createdAt !== fresh.createdAt) {
    return json(200, { id, status: persisted.status });
  }

  await ctx.queue.enqueueScriptGen({ type: 'scriptGen', lessonId: id });
  return json(201, { id, status: persisted.status });
}

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

app.http('lessonCreate', {
  route: 'lesson',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: lessonCreateHandler,
});
