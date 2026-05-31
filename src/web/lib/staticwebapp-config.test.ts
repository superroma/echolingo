import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('staticwebapp.config.json', () => {
  const cfgPath = join(__dirname, '..', 'public', 'staticwebapp.config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
    routes?: Array<{ route: string }>;
    navigationFallback: { rewrite: string; exclude: string[] };
  };

  it('has no /echo/* route rule', () => {
    expect((cfg.routes ?? []).some((r) => r.route.startsWith('/echo'))).toBe(false);
  });

  it('falls back to the bare-id shell', () => {
    expect(cfg.navigationFallback.rewrite).toBe('/shell/index.html');
    expect(cfg.navigationFallback.exclude).toEqual(
      expect.arrayContaining(['/_next/*', '/api/*']),
    );
  });

  it('the fallback target exists on disk after build (skipped if not built)', () => {
    const outDir = join(__dirname, '..', 'out');
    if (!existsSync(outDir)) return;
    expect(existsSync(join(outDir, 'shell', 'index.html'))).toBe(true);
  });
});
