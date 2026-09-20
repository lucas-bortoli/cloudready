import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import { defineConfig } from "vite-plus";
import oxfmtConfig from "./oxfmt.config.ts";
import { lintConfig } from "./oxlint.config.ts";

// @ts-expect-error @types/node is not installed, but I'm not going to install them just for an one-off environment read.
const isVitest = Boolean(process.env.VITEST);

export default defineConfig({
  plugins: [tailwindcss(), solid({ hot: !isVitest })],
  root: "src",
  publicDir: "public",
  server: {
    // Forward API requests during development to the kernel started with `vp run dev:kernel`.
    proxy: {
      "/api/": "http://127.0.0.1:3000",
    },
  },
  build: {
    outDir: "../target/userland-static-bundle",
    emptyOutDir: true,
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: oxfmtConfig,
  lint: lintConfig,
});
