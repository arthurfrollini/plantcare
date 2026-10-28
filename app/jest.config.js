module.exports = {
  preset: 'jest-expo',
  // Jest 30 uses watchman by default; tests don't need file watching.
  watchman: false,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // The shared package ships TypeScript source; map it and let babel transform it.
  moduleNameMapper: {
    '^@plantcare/shared$': '<rootDir>/../packages/shared/src/index.ts',
  },
};
