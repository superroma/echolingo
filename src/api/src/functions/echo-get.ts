import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { getContext } from '../context.js';

export async function echoGetHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const id = req.params.id;
  if (!id) return json(400, { error: 'missing id' });
  const ctx = getContext();
  const echo = await ctx.echoes.get(id);
  if (!echo) return json(404, { error: 'echo not found' });
  return json(200, echo);
}

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

app.http('echoGet', {
  route: 'echo/{id}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: echoGetHandler,
});
