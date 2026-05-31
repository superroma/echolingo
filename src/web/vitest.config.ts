import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Resolve the shared workspace from TypeScript source so tests don't depend on a
// prior `dist` build (keeps `npm test` / CI green without an extra build step).
const fromHere = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Components use the automatic JSX runtime (no `import React`), like Next.js.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@echolingo/shared/types': fromHere('../shared/src/types.ts'),
      '@echolingo/shared/playlist': fromHere('../shared/src/playlist.ts'),
      '@echolingo/shared': fromHere('../shared/src/index.ts'),
    },
  },
  test: {
    // Pure-logic tests run in node. Component/DOM tests opt into jsdom per-file
    // with a `// @vitest-environment jsdom` docblock at the top of the file, so
    // the existing node-env tests are unaffected.
    include: ['{lib,hooks,components,app}/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
  },
});
