import { defineConfig, type OxlintConfig } from "oxlint";

export const lintConfig = {
  jsPlugins: [
    { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
    { name: "solid", specifier: "eslint-plugin-solid" },
  ],
  rules: {
    "vite-plus/prefer-vite-plus-imports": "error",
    "solid/jsx-no-duplicate-props": "error",
    "solid/jsx-no-undef": ["error", { typescriptEnabled: true }],
    "solid/jsx-uses-vars": "error",
    "solid/no-innerhtml": "error",
    "solid/jsx-no-script-url": "error",
    "solid/components-return-once": "warn",
    "solid/no-destructure": "error",
    "solid/prefer-for": "error",
    "solid/reactivity": "warn",
    "solid/event-handlers": "warn",
    "solid/imports": "warn",
    "solid/style-prop": "warn",
    "solid/no-react-deps": "warn",
    "solid/no-react-specific-props": "warn",
    "solid/self-closing-comp": "warn",
  },
  options: { typeAware: true, typeCheck: true },
} satisfies OxlintConfig;

export default defineConfig(lintConfig);
