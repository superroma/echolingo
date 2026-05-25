import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// SWA route matching: first route wins. Wildcard `/foo/*` matches any path
// starting with `/foo/` (any depth). Exact patterns (no trailing /*) match
// only the literal path.
function matchRoute(
  routes: Array<{ route: string; rewrite: string }>,
  path: string,
): { route: string; rewrite: string } | null {
  for (const r of routes) {
    if (r.route.endsWith('/*')) {
      const prefix = r.route.slice(0, -1); // keep trailing slash
      if (path === prefix.slice(0, -1) || path.startsWith(prefix)) return r;
    } else {
      if (path === r.route) return r;
    }
  }
  return null;
}

describe('staticwebapp.config.json', () => {
  const cfgPath = join(__dirname, '..', 'public', 'staticwebapp.config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
    routes: Array<{ route: string; rewrite: string }>;
  };

  it('/echo/new resolves to the new-echo static, not the [id] shell', () => {
    // This is the bug we hit in production: with only /echo/* in the routes
    // list, the user's create-flow navigation to /echo/new got rewritten to
    // /echo/shell/index.html, which rendered EchoByIdClient treating "new"
    // as a lesson id and showing "not found".
    const m = matchRoute(cfg.routes, '/echo/new');
    expect(m?.rewrite).toBe('/echo/new/index.html');
  });

  it('runtime-generated /echo/{id} resolves to the [id] shell', () => {
    const m = matchRoute(cfg.routes, '/echo/d1bfa9965a574152817c2952e13eedec');
    expect(m?.rewrite).toBe('/echo/shell/index.html');
  });

  it('all rewrite targets exist on disk after build (skipped if not built)', () => {
    const outDir = join(__dirname, '..', 'out');
    if (!existsSync(outDir)) return;
    for (const r of cfg.routes) {
      const rel = r.rewrite.replace(/^\//, '');
      expect(existsSync(join(outDir, rel)), `missing rewrite target: ${r.rewrite}`).toBe(
        true,
      );
    }
  });
});
