export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  isRetriable?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 0; attempt < opts.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retriable = opts.isRetriable ? opts.isRetriable(err) : true;
      if (!retriable || attempt === opts.maxAttempts - 1) break;
      await sleep(opts.baseDelayMs * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}
