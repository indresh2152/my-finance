import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Global ignores must live in their own object with no other keys.
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'apps/api/public/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      'no-console': 'error',
      'no-unused-vars': 'off',
      // A leading underscore marks a parameter required by a signature but unused
      // (e.g. Express needs all four args to recognise error middleware).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: 'error',
    },
  },
);
