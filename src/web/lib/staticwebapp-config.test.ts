import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Catches the class of bug where renaming an app route (e.g. /lesson → /echo)
// leaves the SWA navigationFallback config pointing at the old shell path,
// causing /<newroute>/{id} to fall through to /index.html (the home page).
describe('staticwebapp.config.json', () => {
  const cfgPath = join(__dirname, '..', 'public', 'staticwebapp.config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
    routes?: Array<{ route: string; rewrite: string }>;
  };

  it('rewrites /echo/* to the echo shell so deep-link ids resolve client-side', () => {
    const route = cfg.routes?.find((r) => r.route === '/echo/*');
    expect(route, 'missing /echo/* route — runtime-generated ids will 404').toBeDefined();
    expect(route?.rewrite).toBe('/echo/shell/index.html');
  });

  it('routes referenced in config exist on disk after build (skipped if not built)', () => {
    const outDir = join(__dirname, '..', 'out');
    if (!existsSync(outDir)) return; // dev/CI w/o build — skip
    for (const route of cfg.routes ?? []) {
      const rel = route.rewrite.replace(/^\//, '');
      const full = join(outDir, rel);
      expect(existsSync(full), `rewrite target missing: ${route.rewrite}`).toBe(true);
    }
  });
});
