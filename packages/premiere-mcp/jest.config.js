export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'node',
      },
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  testTimeout: 10000,
  verbose: true,
};
