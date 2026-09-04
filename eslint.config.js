// ESLint 9 flat config. Kept deliberately small: the project's correctness
// guarantees live in the test suite; lint catches dead code and accidental
// globals/undefs.
import js from '@eslint/js';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  WebSocket: 'readonly',
  fetch: 'readonly',
  crypto: 'readonly',
  console: 'readonly',
  Node: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  AbortSignal: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  confirm: 'readonly',
};

const nodeGlobals = {
  process: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  AbortSignal: 'readonly',
  URL: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  queueMicrotask: 'readonly',
};

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['backend/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['frontend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...nodeGlobals, ...browserGlobals },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
