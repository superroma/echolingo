import type { Echo, EchoParams } from '@echolingo/shared/types';

// All API calls use relative /api/* paths — never the Function App hostname
// directly. Locally, next.config.mjs rewrites /api/* to the Functions host
// (localhost:7071); in production the Static Web App's linked backend proxies
// /api/* to the Function App. Same-origin everywhere, so no CORS needed.
const API_BASE_URL = '';

export type CreateEchoResult =
  | { kind: 'created'; id: string; status: string }
  | { kind: 'existing'; id: string; status: string }
  | { kind: 'rate_limited'; limit: number; used: number; resetAt: string }
  | { kind: 'error'; status: number; message: string };

export type GetEchoResult =
  | { kind: 'found'; echo: Echo }
  | { kind: 'not_found' }
  | { kind: 'error'; status: number; message: string };

export type DownloadEchoResult =
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

export async function createEcho(id: string, params: EchoParams): Promise<CreateEchoResult> {
  const res = await fetch(`${API_BASE_URL}/api/echo/${encodeURIComponent(id)}`, {
    method: 'PUT',
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

export async function getEcho(id: string): Promise<GetEchoResult> {
  const res = await fetch(`${API_BASE_URL}/api/echo/${encodeURIComponent(id)}`);
  if (res.status === 404) return { kind: 'not_found' };
  const body = await readJson(res);
  if (res.status === 200) {
    return { kind: 'found', echo: body as unknown as Echo };
  }
  return {
    kind: 'error',
    status: res.status,
    message: String(body.error ?? res.statusText),
  };
}

export async function downloadEcho(id: string): Promise<DownloadEchoResult> {
  const res = await fetch(`${API_BASE_URL}/api/echo/${encodeURIComponent(id)}/download`, { method: 'POST' });
  const body = await readJson(res);
  if (res.status === 200) {
    return { kind: 'ready', url: String(body.url) };
  }
  if (res.status === 409) {
    return { kind: 'not_ready', message: String(body.error ?? 'echo not ready') };
  }
  return {
    kind: 'error',
    status: res.status,
    message: String(body.error ?? res.statusText),
  };
}
