import { mergeConfig } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "happy-dom",
      // Keep concurrent DOM simulations from distorting Solid's timing diagnostics.
      maxWorkers: 2,
      exclude: [...configDefaults.exclude, "**/*.browser.spec.ts"],
    },
  }),
);
