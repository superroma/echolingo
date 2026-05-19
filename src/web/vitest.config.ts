import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{lib,hooks}/**/*.test.ts'],
    environment: 'node',
  },
});
