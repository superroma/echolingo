import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { isEchoParams, isEchoId, type Echo } from '../_shared/index.js';
import { getContext } from '../context.js';

function clientIp(req: HttpRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return 'unknown';
}
function today(): string { return new Date().toISOString().slice(0, 10); }
function tomorrowUtc(): string {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  t.setUTCHours(0, 0, 0, 0);
  return t.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function echoCreateHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const id = req.params.id;
  if (!isEchoId(id)) return json(400, { error: 'invalid id' });

  let body: unknown;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid JSON body' }); }
  if (!isEchoParams(body)) return json(400, { error: 'invalid EchoParams' });

  const ctx = getContext();

  const existing = await ctx.echoes.get(id);
  if (existing) {
    ctx.telemetry.emit({ name: 'echo.cache_hit', properties: { echoId: id } });
    return json(200, { id, status: existing.status });
  }

  const ip = clientIp(req);
  const date = today();
  const limit = ctx.config.rateLimitPerDay;
  const used = await ctx.rateLimits.get(ip, date);
  if (used >= limit) {
    ctx.telemetry.emit({ name: 'echo.rate_limited', properties: { ip, used, limit } });
    return json(429, { limit, used, resetAt: tomorrowUtc() });
  }
  await ctx.rateLimits.increment(ip, date);

  const now = new Date().toISOString();
  const fresh: Echo = {
    id, params: body, status: 'generating_script',
    createdAt: now, updatedAt: now, totalSentences: 0, readySentences: 0, sentences: [],
  };
  const persisted = await ctx.echoes.createIfAbsent(fresh);
  const wasFresh = persisted.createdAt === fresh.createdAt;
  if (wasFresh) {
    await ctx.queue.enqueueScriptGen({ type: 'scriptGen', echoId: id });
    ctx.telemetry.emit({
      name: 'echo.created',
      properties: { echoId: id, llmEngine: ctx.config.llmEngine, ttsEngine: ctx.config.ttsEngine },
    });
    return json(201, { id, status: persisted.status });
  }
  return json(200, { id, status: persisted.status });
}

function json(status: number, body: unknown): HttpResponseInit {
  return { status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

app.http('echoCreate', {
  route: 'echo/{id}',
  methods: ['PUT'],
  authLevel: 'anonymous',
  handler: echoCreateHandler,
});
