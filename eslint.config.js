import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * ✅ PRIORITY 3: Enhanced ESLint Configuration
 * 
 * Custom rules to enforce PlaniFlow coding standards:
 * - Prevent common bugs (any usage, console.log)
 * - Enforce best practices (explicit return types)
 * - Improve code quality (complexity limits)
 * - Enhance maintainability (max lines per file)
 */
export default tseslint.config(
  { ignores: ["dist", "node_modules", "*.config.js", "*.config.ts", "supabase/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      
      // ============================================
      // React & Hooks Rules
      // ============================================
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // ============================================
      // TypeScript Rules - PRIORITY 3
      // ============================================
      
      // Prevent 'any' usage (use 'unknown' instead)
      "@typescript-eslint/no-explicit-any": "error",
      
      // Require explicit return types on functions
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      
      // Unused vars with ignore patterns
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      
      // Consistent type imports
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
        },
      ],
      
      // No floating promises
      "@typescript-eslint/no-floating-promises": "error",
      
      // Require await in async functions
      "@typescript-eslint/require-await": "warn",
      
      // No misused promises
      "@typescript-eslint/no-misused-promises": "error",

      // ============================================
      // Code Quality Rules - PRIORITY 3
      // ============================================
      
      // No console.log in production (use logger)
      "no-console": ["warn", { allow: ["warn", "error"] }],
      
      // Complexity limits
      "complexity": ["warn", 15],
      "max-lines-per-function": ["warn", { max: 150, skipBlankLines: true, skipComments: true }],
      "max-depth": ["warn", 4],
      "max-nested-callbacks": ["warn", 3],
      
      // File size limits
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
      
      // Prefer const
      "prefer-const": "error",
      
      // No var
      "no-var": "error",
      
      // Prefer template literals
      "prefer-template": "warn",
      
      // No duplicate imports
      "no-duplicate-imports": "error",
      
      // Require === instead of ==
      "eqeqeq": ["error", "always"],
      
      // No nested ternary
      "no-nested-ternary": "warn",
      
      // Curly braces for all control statements
      "curly": ["error", "all"],
      
      // No magic numbers
      "no-magic-numbers": [
        "warn",
        {
          ignore: [-1, 0, 1, 2, 10, 100, 1000],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          enforceConst: true,
        },
      ],

      // ============================================
      // Security Rules - PRIORITY 3
      // ============================================
      
      // No eval
      "no-eval": "error",
      
      // No implied eval
      "no-implied-eval": "error",
      
      // No new Function
      "no-new-func": "error",
      
      // Alert/confirm/prompt (use custom dialogs)
      "no-alert": "warn",

      // ============================================
      // Performance Rules - PRIORITY 3
      // ============================================
      
      // Warn on large inline functions in JSX
      "max-statements": ["warn", 20],
      
      // Prefer arrow functions for callbacks
      "prefer-arrow-callback": "warn",
    },
  },
  
  // ============================================
  // Test Files - Relaxed Rules
  // ============================================
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-magic-numbers": "off",
      "max-lines-per-function": "off",
      "max-lines": "off",
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  
  // ============================================
  // Config Files - Minimal Rules
  // ============================================
  {
    files: ["*.config.{js,ts}", "vite.config.ts", "vitest.config.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-magic-numbers": "off",
    },
  }
);
