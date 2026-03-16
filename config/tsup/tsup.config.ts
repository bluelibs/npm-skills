import { defineConfig } from "tsup";

type BuildFormat = "cjs" | "esm";

const COMMON = {
  splitting: false,
  sourcemap: true,
  treeshake: true,
  minify: false,
  tsconfig: "config/ts/tsconfig.build.json",
  dts: false,
  target: "es2022",
  clean: true,
  platform: "node" as const,
  format: ["esm", "cjs"] as BuildFormat[],
};

const outExtension = (ctx: { format: BuildFormat }) => ({
  js: ctx.format === "cjs" ? ".cjs" : ".mjs",
});

export default defineConfig({
  ...COMMON,
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    bin: "bin.ts",
  },
  outDir: "dist",
  banner: {
    js: "#!/usr/bin/env node",
  },
  outExtension,
});
