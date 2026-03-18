import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = path.resolve(repoRoot, "dist", "bin.cjs");

function isCi() {
  return process.env.CI === "true";
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function assertSuccess(result, label) {
  if (result.status === 0) return;

  throw new Error(
    `${label} failed with exit code ${result.status ?? "unknown"}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

function assertIncludes(haystack, needle, label) {
  if (haystack.includes(needle)) return;
  throw new Error(`${label} did not include ${JSON.stringify(needle)}.\n${haystack}`);
}

async function createSmokeProject() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "npm-skills-runtime-"));
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify(
      {
        name: "runtime-smoke",
        version: "1.0.0",
        dependencies: {
          "skill-package": "1.0.0",
        },
      },
      null,
      2,
    ),
  );

  await mkdir(path.join(cwd, "node_modules", "skill-package", "skills", "release"), {
    recursive: true,
  });
  await writeFile(
    path.join(cwd, "node_modules", "skill-package", "package.json"),
    JSON.stringify({ name: "skill-package", version: "1.0.0" }, null, 2),
  );
  await writeFile(
    path.join(cwd, "node_modules", "skill-package", "skills", "release", "SKILL.md"),
    "# Release\n",
  );

  return cwd;
}

async function verifyExtractedSkill(cwd) {
  const content = await readFile(
    path.join(cwd, ".agents", "skills", "skill-package-release", "SKILL.md"),
    "utf8",
  );
  assertIncludes(content, "# Release", "extracted skill");
}

async function runSmoke(runtime) {
  const projectCwd = await createSmokeProject();
  const baseArgs = runtime === "deno" ? ["run", "-A", cliEntry] : [cliEntry];

  try {
    const helpResult = runCommand(runtime, [...baseArgs, "--help"]);
    assertSuccess(helpResult, `${runtime} help`);
    assertIncludes(helpResult.stdout, "npm-skills", `${runtime} help`);

    const skippedResult = runCommand(runtime, [...baseArgs, "extract", "--env", "development"], {
      cwd: projectCwd,
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
    });
    assertSuccess(skippedResult, `${runtime} env gate`);
    assertIncludes(
      skippedResult.stdout,
      "Skipped extraction because NODE_ENV is production, expected development.",
      `${runtime} env gate`,
    );

    const extractResult = runCommand(
      runtime,
      [...baseArgs, "extract", "--env", "development", "--override"],
      {
        cwd: projectCwd,
        env: {
          ...process.env,
          NODE_ENV: "development",
        },
      },
    );
    assertSuccess(extractResult, `${runtime} extract`);
    assertIncludes(extractResult.stdout, "Imported 1 skills", `${runtime} extract`);
    await verifyExtractedSkill(projectCwd);
  } finally {
    await rm(projectCwd, { recursive: true, force: true });
  }
}

function ensureRuntimeAvailable(runtime) {
  const result = runCommand(runtime, ["--version"]);
  assertSuccess(result, `${runtime} --version`);
}

async function main() {
  if (isCi()) {
    console.log("Skipping runtime smoke tests on CI.");
    return;
  }

  ensureRuntimeAvailable("bun");
  ensureRuntimeAvailable("deno");

  await runSmoke("bun");
  await runSmoke("deno");

  console.log("Bun and Deno runtime smoke tests passed.");
}

await main();
