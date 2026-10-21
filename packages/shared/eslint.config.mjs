// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // No type assertions at all (const assertions stay allowed): narrow
      // with a check, parse with a schema, or type the source instead.
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'TSAsExpression > TSAsExpression[typeAnnotation.type="TSUnknownKeyword"]',
          message:
            'No `as unknown as`: type the value (a narrower type or a schema).',
        },
        {
          selector: 'TSAsExpression[typeAnnotation.type="TSNeverKeyword"]',
          message: 'No `as never`: type the value instead.',
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
