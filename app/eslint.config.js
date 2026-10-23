const { defineConfig, globalIgnores } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');

module.exports = defineConfig([
  globalIgnores(['node_modules', '.expo', 'dist', 'eslint.config.js', 'jest.config.js']),
  expo,
  {
    files: ['src/**/*.{ts,tsx}', 'App.tsx'],
    extends: [tseslint.configs.recommended],
  },
  {
    // Files written or rewritten for the API integration get the api/ rule set.
    files: [
      'src/api/**/*.{ts,tsx}',
      'src/auth/**/*.{ts,tsx}',
      'src/reminders/**/*.{ts,tsx}',
      'src/plants/**/*.{ts,tsx}',
      'src/pages/Auth.tsx',
      'src/pages/PlantDetail.tsx',
      'src/components/BottomSheet.tsx',
      'src/components/CareTiles.tsx',
      'src/components/DaysSheet.tsx',
      'src/components/HeroHeader.tsx',
      'src/components/LeadInfoSheet.tsx',
      'src/components/PhotoSheet.tsx',
      'src/components/SickPlantCard.tsx',
      'src/components/TimeSheet.tsx',
      'src/pages/Profile.tsx',
      'src/pages/Welcome.tsx',
      'src/pages/PlantSelect.tsx',
      'src/components/FilterChip.tsx',
      'src/components/PlantCardPrimary.tsx',
      'src/components/PlantCardSecondary.tsx',
      'src/pages/MyPlants.tsx',
      'src/components/NameRow.tsx',
      'src/components/PasswordSheet.tsx',
      'src/components/DeleteAccountSheet.tsx',
      'src/components/Toast.tsx',
    ],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
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
    },
  },
]);
