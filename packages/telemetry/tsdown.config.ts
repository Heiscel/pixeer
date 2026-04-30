import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: false,
    clean: true,
    minify: true,
    deps: { neverBundle: ['react'] },
    outDir: 'dist',
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.mjs' };
    },
  },
  {
    entry: ['./src/react.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: false,
    minify: true,
    deps: { neverBundle: ['react'] },
    outDir: 'dist',
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.react.cjs' : '.react.mjs' };
    },
  },
]);
