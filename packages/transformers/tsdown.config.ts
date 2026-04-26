import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: false,
  clean: true,
  minify: false,
  deps: { neverBundle: ["@huggingface/transformers", "pixeer"] },
  outDir: "dist",
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".mjs" };
  },
});
