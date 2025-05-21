import { Config } from "@jest/types";
import conf from "../../jest.config";

const config: Config.InitialOptions = {
  ...conf,
  collectCoverage: true,
  coverageDirectory: "./workdocs/reports/coverage",
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "./workdocs/reports/junit",
        outputName: "junit-report.xml",
      },
    ],
    [
      "jest-html-reporters",
      {
        publicPath: "./workdocs/reports/html",
        filename: "test-report.html",
        openReport: true,
        expand: true,
        pageTitle: "for-http Test Report",
        stripSkippedTest: true,
        darkTheme: true,
        enableMergeData: true,
        dataMergeLevel: 2,
      },
    ],
  ],
  coverageThreshold: {
    global: {
      branches: 38,
      functions: 42,
      lines: 57,
      statements: 54,
    },
  },
};

export default config;
