import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/index.ts', 'src/react.ts', 'src/types.ts'],
      thresholds: { lines: 75, functions: 75, branches: 60, statements: 75 },
    },
  },
});
