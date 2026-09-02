const config = {
  verbose: true,
  // eslint-disable-next-line no-undef
  rootDir: __dirname,
  preset: "ts-jest/presets/default-esm",
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          module: "ESNext",
          target: "ES2020",
        },
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  testEnvironment: "node",
  testRegex: "/tests/.*\\.(test|spec)\\.(ts|tsx)$",
  // debug scratch test - imports workspace-sibling fixtures (for-nest tests), CI-incompatible
  testPathIgnorePatterns: ["/node_modules/", "/tests/unit/debug-metadata.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  coverageDirectory: "./workdocs/reports/coverage",
  collectCoverage: false,
  collectCoverageFrom: ["src/**/*.{js,jsx,ts,tsx}", "!src/**/cli.ts"],
  reporters: ["default"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transformIgnorePatterns: [],
};

// eslint-disable-next-line no-undef
module.exports = config;
