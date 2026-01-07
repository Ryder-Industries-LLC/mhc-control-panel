export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/server/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@exodus/bytes|html-encoding-sniffer)/)',
  ],
  extensionsToTreatAsEsm: ['.ts'],
  collectCoverageFrom: [
    'server/src/**/*.ts',
    '!server/src/**/*.d.ts',
    '!server/src/**/*.test.ts',
    '!server/src/**/*.spec.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
