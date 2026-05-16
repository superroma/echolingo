import { describe, it, expect } from 'vitest';
import { healthHandler } from '../src/functions/health.js';

describe('healthHandler', () => {
  it('responds 200 with status ok and a timestamp', async () => {
    const res = await healthHandler();
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });
});
