import { defineConfig } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [tailwindcss(), solid()],
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
  fmt: {
    sortTailwindcss: {
      stylesheet: "./src/style.css",
    },
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
