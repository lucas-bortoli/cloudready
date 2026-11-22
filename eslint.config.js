import js from "@eslint/js";
import globals from "globals";
import solid from "eslint-plugin-solid";
import solid2 from "eslint-plugin-solid/configs/v2";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["node_modules/", "target/", "test-results/", "playwright-report/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      solid,
    },
    settings: solid2.settings,
    rules: {
      ...solid2.rules,
      "no-unassigned-vars": "off",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    languageOptions: {
      globals: globals.vitest,
    },
  },
  {
    files: ["*.config.{js,ts}"],
    languageOptions: {
      globals: globals.node,
    },
  },
];
