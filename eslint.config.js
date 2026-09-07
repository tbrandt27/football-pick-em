import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".astro/**",
      "node_modules/**",
      "localstack-data/**",
      "support_docs/**",
      "coverage/**",
      "package-lock.json",
    ],
  },

  // Baseline for every file we lint.
  js.configs.recommended,

  // Express backend and Node scripts: plain ESM JavaScript on Node globals.
  {
    files: ["server/**/*.js", "scripts/**/*.js", "setup.js", "*.config.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // Server code intentionally logs; the migration to utils/logger.js is tracked separately.
      "no-console": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Catches stray expression statements like the empty template literal in DynamoDBProvider.js.
      "no-unused-expressions": "error",
      eqeqeq: ["error", "smart"],
      "no-return-await": "warn",
      // Fires on defensive `let count = 0` initialisers that every branch
      // overwrites. Keeping the initialiser is deliberate, so warn only.
      "no-useless-assignment": "warn",
      "require-atomic-updates": "off",
    },
  },

  // React islands and shared browser TypeScript.
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { "jsx-a11y": jsxA11y, "react-hooks": reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // --- Existing debt, demoted to warnings ---------------------------------
      // These all flag real issues, but there are too many in the current code
      // to gate CI on. They are warnings so `npm run lint` stays green at HEAD
      // while the counts stay visible and can be driven down. Promote each back
      // to "error" as its category reaches zero.
      //
      // 145 hits: new in eslint-plugin-react-hooks v7. Fires wherever JSX is
      // constructed inside a try/catch, which this codebase does throughout.
      "react-hooks/error-boundaries": "warn",
      // 23 hits: form inputs not associated with their <label>.
      "jsx-a11y/label-has-associated-control": "warn",
      // 10 hits: onClick on non-interactive elements with no keyboard handler.
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      // 42 hits: props/state mutated in place, effects that setState on mount,
      // and incomplete dependency arrays -- the root cause of the render loops
      // and leaked intervals noted in the analysis.
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // There are ~13 existing `any` usages; warn so they surface without blocking the build.
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // Astro page/layout components.
  ...astro.configs.recommended,

  // Vitest specs. The TypeScript specs need the TS parser, which the src/**
  // block above does not cover.
  {
    files: ["test/**/*.{js,ts,tsx}", "**/*.{test,spec}.{js,ts,tsx}"],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },

  // Must stay last so formatting rules lose to Prettier.
  prettier
);
