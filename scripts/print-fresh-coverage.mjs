#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { isInCoverageScope, toPosixPath } from "./coverage-scope.mjs";

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

function main() {
  const finalPath = path.join(process.cwd(), "coverage", "coverage-final.json");
  const final = readJson(finalPath);

  if (!final || typeof final !== "object") {
    console.log("\nCOVERAGE: No coverage artifacts available.");
    return;
  }

  const underCovered = [];

  for (const [absFile, entry] of Object.entries(final)) {
    if (!absFile || !entry) continue;

    const relPosix = toPosixPath(path.relative(process.cwd(), absFile));
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

    if (!allHundred) underCovered.push(relPosix);
  }

  if (underCovered.length === 0) {
    console.log("\nCOVERAGE: All tracked files are at 100%.");
    return;
  }

  console.log("\nCOVERAGE BELOW 100%:");
  for (const file of underCovered.sort()) {
    console.log(`- ${file}`);
  }
  process.exitCode = 1;
}

main();
