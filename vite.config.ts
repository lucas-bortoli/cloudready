import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

const isVitest = Boolean(process.env.VITEST);

export default defineConfig({
  plugins: [tailwindcss(), solid({ hot: !isVitest })],
  root: "src",
  publicDir: "public",
  server: {
    // Forward API requests during development to the kernel started with `npm run dev:kernel`.
    proxy: {
      "/api/": "http://127.0.0.1:3000",
    },
  },
  build: {
    outDir: "../target/userland-static-bundle",
    emptyOutDir: true,
  },
});
