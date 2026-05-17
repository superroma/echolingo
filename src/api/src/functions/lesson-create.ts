import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { isLessonParams, lessonId, type Lesson } from '@echolingo/shared';
import { getContext } from '../context.js';

function clientIp(req: HttpRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return 'unknown';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowUtc(): string {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  t.setUTCHours(0, 0, 0, 0);
  return t.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

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

  // Cache-hit fast path (does not consume rate limit)
  const existing = await ctx.lessons.get(id);
  if (existing) {
    return json(200, { id, status: existing.status });
  }

  // Fresh creation — consume rate limit
  const ip = clientIp(req);
  const date = today();
  const limit = ctx.config.rateLimitPerDay;
  const used = await ctx.rateLimits.get(ip, date);
  if (used >= limit) {
    return json(429, { limit, used, resetAt: tomorrowUtc() });
  }
  await ctx.rateLimits.increment(ip, date);

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
  const wasFresh = persisted.createdAt === fresh.createdAt;
  if (wasFresh) {
    await ctx.queue.enqueueScriptGen({ type: 'scriptGen', lessonId: id });
    return json(201, { id, status: persisted.status });
  }
  return json(200, { id, status: persisted.status });
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
