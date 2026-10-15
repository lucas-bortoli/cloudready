/** @type {import("prettier").Config & import("prettier-plugin-tailwindcss").PluginOptions} */
export default {
  plugins: ["prettier-plugin-tailwindcss"],
  printWidth: 100,
  endOfLine: "auto",
  tailwindFunctions: ["cn"],
  tailwindStylesheet: "./src/style.css",
};
