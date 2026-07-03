// Flat ESLint config for the Build Studio. Lint-only: no formatting/stylistic
// rules (there is intentionally no Prettier). Type-aware checks are handled by
// `npm run typecheck`; ESLint focuses on correctness rules tsc does not cover
// (React hooks rules, unused vars with underscore escape hatch, etc.).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'renderer/dist/**',
      'node_modules/**',
      'build/**',
      'eslint.config.mjs',
      '**/*.d.ts',
    ],
  },

  // Renderer: React + TypeScript (browser globals).
  {
    files: ['renderer/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      // tsc's noUnusedLocals/Parameters is the primary gate; keep ESLint aligned
      // with an underscore escape hatch for deliberately-unused bindings.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-unused-vars': 'off',
    },
  },

  // Main process, preload, bridge, scripts: Node/CommonJS.
  {
    files: ['*.js', 'scripts/**/*.js', 'test/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
)
