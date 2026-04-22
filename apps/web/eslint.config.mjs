import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import("eslint").Linter.Config[]} */
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
const nextTypescript = require("eslint-config-next/typescript");

/**
 * CI gate: `pnpm lint` uses `--quiet` (errors only). Full warnings: `pnpm lint:report`.
 * Debt inventory and tightening policy: ../../docs/lint-debt.md (Phase 6G).
 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "**/node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "android/**",
      "ios/**",
      "capacitor-app/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    files: ["**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react/no-unescaped-entities": "warn",
      "react/no-children-prop": "warn",
      "@next/next/no-html-link-for-pages": "warn",
    },
  },
  {
    // Design system guardrails — see docs/DESIGN_SYSTEM.md
    files: ["src/app/portal/**/*.{tsx,ts}", "src/app/client/**/*.{tsx,ts}"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "Literal[value=/\\b(?:bg|text|border|hover:bg|hover:text|hover:border)-slate-(?:50|100|200|300|400|500|600|700)(?:\\b|\\/)/]",
          message:
            "Use --wp-* tokens instead of slate-* (see docs/DESIGN_SYSTEM.md). Dark chrome (slate-800/900) is allowed.",
        },
        {
          selector: "Literal[value=/#[0-9a-fA-F]{6}(?![0-9a-fA-F])/]",
          message:
            "Hex colors are not allowed in portal/client className strings. Use var(--wp-*) tokens.",
        },
      ],
    },
  },
];

export default eslintConfig;
