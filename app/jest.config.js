module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // The shared package ships TypeScript source; map it and let babel transform it.
  moduleNameMapper: {
    '^@plantcare/shared$': '<rootDir>/../packages/shared/src/index.ts',
  },
};
