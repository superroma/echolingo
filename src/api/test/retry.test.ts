import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff } from '@echolingo/shared';

describe('retryWithBackoff', () => {
  it('returns the result of the first successful call', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient failure and eventually succeeds', async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt += 1;
      if (attempt < 3) throw new Error('boom');
      return 'ok';
    });
    const result = await retryWithBackoff(fn, { maxAttempts: 5, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after maxAttempts', async () => {
    const err = new Error('persistent');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when isRetriable returns false', async () => {
    const err = new Error('client-error') as Error & { status?: number };
    err.status = 400;
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 3,
        baseDelayMs: 1,
        isRetriable: (e) => (e as { status?: number }).status !== 400,
      }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('applies exponential backoff between attempts', async () => {
    const sleeps: number[] = [];
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt += 1;
      if (attempt < 4) throw new Error('boom');
      return 'ok';
    });
    await retryWithBackoff(fn, {
      maxAttempts: 5,
      baseDelayMs: 10,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toEqual([10, 20, 40]);
  });
});
