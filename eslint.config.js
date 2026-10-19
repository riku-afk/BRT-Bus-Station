import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['.next', 'node_modules', 'plan']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Server code must never import browser code, and vice versa (see ARCHITECTURE.md).
    files: ['src/server/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@/*'], message: 'Server code must not import src/client.' }] }],
    },
  },
  {
    files: ['src/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@modules/*', '@core/*', '@lib/*', '@middleware/*', '@config/*', '@integrations/*'], message: 'Browser code must not import src/server. Use src/shared or the /api contract.' },
          ],
        },
      ],
    },
  },
]);
