import { app, type HttpResponseInit } from '@azure/functions';

export async function healthHandler(): Promise<HttpResponseInit> {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
  };
}

app.http('health', {
  route: 'health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: healthHandler,
});
