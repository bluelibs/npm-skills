const os = require("os");
const path = require("path");

const isAiCoverageRun = process.env.AI_REPORTER_DISABLE_COVERAGE === "1";

module.exports = {
  rootDir: path.join(__dirname, "../.."),
  preset: "ts-jest",
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/config/ts/tsconfig.jest.json",
        diagnostics: false,
      },
    ],
  },
  testEnvironment: "node",
  testTimeout: 10000,
  cacheDirectory: path.join(os.tmpdir(), "jest-cache-npm-skills"),
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/*.test.ts",
  ],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/jest.setup.ts"],
  coverageProvider: "babel",
  coverageDirectory: "coverage",
  coverageReporters: ["text", "json-summary"],
  coverageThreshold: isAiCoverageRun
    ? undefined
    : {
        global: {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
};
