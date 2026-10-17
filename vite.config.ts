import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const isVitest = Boolean(process.env.VITEST);

export default defineConfig({
  plugins: [tailwindcss(), solid({ hot: !isVitest })],
  root: "src",
  publicDir: "public",
  server: {
    // Forward API requests during development to the kernel started with `npm run dev:kernel`.
    proxy: {
      "/api/": { target: "http://127.0.0.1:3000", ws: true },
    },
    allowedHosts: ["home"],
  },
  build: {
    outDir: "../target/userland-static-bundle",
    emptyOutDir: true,
  },
});
