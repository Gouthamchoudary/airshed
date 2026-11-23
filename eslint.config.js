import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['genai/weights.js', 'test-results/', 'playwright-report/', '.vercel/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', globals: globals.browser },
    rules: {
      'no-implicit-coercion': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['api/**/*.js', 'tests/**/*.js', 'e2e/**/*.js', '*.config.js', 'genai/*.test.mjs'],
    languageOptions: { globals: globals.node },
  },
];
