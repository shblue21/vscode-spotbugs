// Flat ESLint config for ESLint v9
// Migrated from .eslintrc.json (CommonJS to avoid ESM warning)
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const prettierPlugin = require("eslint-plugin-prettier");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = [
  {
    ignores: ["out", "dist", "**/*.d.ts"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier: prettierPlugin,
    },
    rules: {
      "@typescript-eslint/naming-convention": "warn",
      // Use core semi rule for TS files
      semi: "warn",
      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
      "prettier/prettier": "warn",
    },
  },
  // Disable stylistic rules that may conflict with Prettier
  eslintConfigPrettier,
];
