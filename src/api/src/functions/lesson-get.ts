import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { getContext } from '../context.js';

export async function lessonGetHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const id = req.params.id;
  if (!id) return json(400, { error: 'missing id' });
  const ctx = getContext();
  const lesson = await ctx.lessons.get(id);
  if (!lesson) return json(404, { error: 'lesson not found' });
  return json(200, lesson);
}

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

app.http('lessonGet', {
  route: 'lesson/{id}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: lessonGetHandler,
});
