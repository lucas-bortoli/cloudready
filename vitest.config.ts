import { mergeConfig } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "happy-dom",
      // Avoid competing DOM simulations inflating Solid's wall-clock timing diagnostics in CI.
      maxWorkers: 1,
      exclude: [...configDefaults.exclude, "**/*.browser.spec.ts"],
    },
  }),
);
