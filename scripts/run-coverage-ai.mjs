#!/usr/bin/env node
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import {
  isInCoverageScope,
  toCoverageScopedRelPosixPath,
} from "./coverage-scope.mjs";

function parseArgs(argv) {
  const idx = argv.indexOf("--");
  if (idx === -1) return { extraJestArgs: argv.slice(2) };
  return { extraJestArgs: argv.slice(idx + 1) };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (_) {
    return undefined;
  }
}

function computeCounts(map) {
  const entries = map && typeof map === "object" ? Object.values(map) : [];
  let total = 0;
  let hit = 0;
  for (const entry of entries) {
    total++;
    if (Number(entry) > 0) hit++;
  }
  return { hit, total };
}

function computeBranchCounts(branchHits) {
  const entries =
    branchHits && typeof branchHits === "object" ? Object.values(branchHits) : [];
  let total = 0;
  let hit = 0;
  for (const entry of entries) {
    const values = Array.isArray(entry) ? entry : [];
    total += values.length;
    hit += values.filter((value) => Number(value) > 0).length;
  }
  return { hit, total };
}

function countCoverageBelowHundredFromFinal() {
  const finalPath = path.join(process.cwd(), "coverage", "coverage-final.json");
  const final = readJson(finalPath);
  if (!final || typeof final !== "object") return undefined;

  let count = 0;
  for (const [absFile, entry] of Object.entries(final)) {
    if (!absFile || !entry) continue;
    const relPosix = toCoverageScopedRelPosixPath(absFile);
    if (!isInCoverageScope(relPosix)) continue;

    const statements = computeCounts(entry.s);
    const lines = computeCounts(entry.l);
    const functions = computeCounts(entry.f);
    const branches = computeBranchCounts(entry.b);

    const allHundred =
      statements.hit === statements.total &&
      lines.hit === lines.total &&
      functions.hit === functions.total &&
      branches.hit === branches.total;

    if (!allHundred) count++;
  }

  return count;
}

function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
      shell: false,
    });
    child.on("close", (code) => resolve(code ?? 0));
  });
}

async function main() {
  const start = performance.now();
  const { extraJestArgs } = parseArgs(process.argv);

  const coverageDir = path.join(process.cwd(), "coverage");
  fs.mkdirSync(coverageDir, { recursive: true });
  const reporterSummaryPath = path.join(coverageDir, "ai-jest-summary.json");

  const jestArgs = [
    "--config",
    "config/jest/jest.config.js",
    "--coverage",
    "--reporters=./scripts/jest-ai-reporter.js",
    "--coverageReporters=json-summary",
    "--coverageReporters=json",
    "--silent",
    ...extraJestArgs,
  ];

  const jestCode = await run(
    "node",
    ["./scripts/run-jest-watchdog.mjs", "--", ...jestArgs],
    {
      AI_REPORTER_DISABLE_COVERAGE: "1",
      AI_REPORTER_SUMMARY_PATH: reporterSummaryPath,
      NODE_NO_WARNINGS: "1",
    },
  );

  const coverageCode = await run("node", ["./scripts/print-fresh-coverage.mjs"]);
  const reporterSummary = readJson(reporterSummaryPath);
  const failedTests =
    typeof reporterSummary?.summary?.failedTests === "number"
      ? reporterSummary.summary.failedTests
      : undefined;
  const runtimeErrorSuites =
    typeof reporterSummary?.summary?.runtimeErrorSuites === "number"
      ? reporterSummary.summary.runtimeErrorSuites
      : undefined;
  const errors =
    typeof failedTests === "number" && typeof runtimeErrorSuites === "number"
      ? failedTests + runtimeErrorSuites
      : undefined;

  const end = performance.now();
  const duration = ((end - start) / 1000).toFixed(2);
  console.log(
    `\nDone in ${duration}s | Errors: ${errors ?? "?"} | Coverage<100%: ${
      countCoverageBelowHundredFromFinal() ?? "?"
    }`,
  );

  process.exit(jestCode !== 0 ? jestCode : coverageCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
