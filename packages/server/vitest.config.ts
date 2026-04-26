import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/index.ts', 'src/types.ts', 'src/transports/**'],
      thresholds: { lines: 80, functions: 85, branches: 70, statements: 80 },
    },
  },
});
