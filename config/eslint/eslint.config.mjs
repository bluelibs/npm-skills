import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import jestPlugin from "eslint-plugin-jest";
import unusedImports from "eslint-plugin-unused-imports";
import prettierPluginRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ESLINT_CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_DIR = path.resolve(ESLINT_CONFIG_DIR, "../..");

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "scripts/**",
      "*.config.js",
      "*.config.mjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/__tests__/**/*.ts", "**/*.test.ts"],
    ...jestPlugin.configs["flat/recommended"],
    rules: {
      ...jestPlugin.configs["flat/recommended"].rules,
      "jest/no-conditional-expect": "off",
      "jest/expect-expect": "off",
      "jest/no-identical-title": "off",
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: REPO_ROOT_DIR,
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-catch": "off",
      "prefer-const": "warn",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          "vars": "all",
          "varsIgnorePattern": "^_",
          "args": "all",
          "argsIgnorePattern": "^_",
          "caughtErrors": "all",
          "caughtErrorsIgnorePattern": "^_",
          "destructuredArrayIgnorePattern": "^_",
          "ignoreRestSiblings": true
        }
      ]
    },
  },
  {
    files: ["src/__tests__/**/*.ts", "**/*.test.ts"],
    rules: {
      "unused-imports/no-unused-vars": "off",
    },
  },
  prettierPluginRecommended,
);
