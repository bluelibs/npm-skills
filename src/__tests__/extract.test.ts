import * as fs from "node:fs/promises";
import * as nodeModule from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { extractSkills } from "../extract";
import { Logger, OverwritePrompt } from "../types";

async function createTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "npm-skills-test-"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

function endsWithPath(targetPath: unknown, ...segments: string[]): boolean {
  return path.normalize(String(targetPath)).endsWith(path.join(...segments));
}

function createLogger() {
  const messages = {
    info: [] as string[],
    warn: [] as string[],
  };

  const logger: Logger = {
    info(message) {
      messages.info.push(message);
    },
    warn(message) {
      messages.warn.push(message);
    },
  };

  return { logger, messages };
}

describe("extractSkills", () => {
  it("uses default cwd, output dir, and logger when options are omitted", async () => {
    const cwd = await createTempProject();
    const previousCwd = process.cwd();
    const logSpy = jest
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "default-package": "1.0.0",
        "missing-skills-package": "1.0.0",
      },
    });
    await writeJson(
      path.join(cwd, "node_modules/default-package/package.json"),
      {
        name: "default-package",
        version: "1.0.0",
      },
    );
    await writeJson(
      path.join(cwd, "node_modules/missing-skills-package/package.json"),
      {
        name: "missing-skills-package",
        version: "1.0.0",
      },
    );
    await writeFile(
      path.join(cwd, "node_modules/default-package/skills/basic/SKILL.md"),
      "# Basic\n",
    );

    try {
      process.chdir(cwd);
      const report = await extractSkills();
      expect(await fs.realpath(report.outputDir)).toBe(
        await fs.realpath(path.join(cwd, ".agents/skills")),
      );
      expect(report.extracted.map((entry) => entry.destinationName)).toEqual([
        "default-package-basic",
      ]);
      expect(report.skipped.map((entry) => entry.reason)).toEqual([
        "missing-source",
      ]);
    } finally {
      process.chdir(previousCwd);
    }

    expect(logSpy).toHaveBeenCalledWith("Extracted default-package-basic");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("No skills found for missing-skills-package"),
    );
  });

  it("keeps default output workspace-local inside packages directories", async () => {
    const repoRoot = await createTempProject();
    const cwd = path.join(repoRoot, "packages", "app");
    const previousCwd = process.cwd();

    await writeJson(path.join(repoRoot, "package.json"), {
      name: "repo",
      workspaces: ["packages/*"],
    });
    await writeJson(path.join(cwd, "package.json"), {
      name: "app",
      dependencies: {
        "default-package": "1.0.0",
      },
    });
    await writeJson(
      path.join(cwd, "node_modules/default-package/package.json"),
      {
        name: "default-package",
        version: "1.0.0",
      },
    );
    await writeFile(
      path.join(cwd, "node_modules/default-package/skills/basic/SKILL.md"),
      "# Basic\n",
    );

    try {
      process.chdir(cwd);
      const report = await extractSkills();

      expect(await fs.realpath(report.outputDir)).toBe(
        await fs.realpath(path.join(cwd, ".agents/skills")),
      );
      await expect(
        fs.readFile(
          path.join(cwd, ".agents/skills/default-package-basic/SKILL.md"),
          "utf8",
        ),
      ).resolves.toBe("# Basic\n");
      await expect(
        fs.access(path.join(repoRoot, ".agents/skills")),
      ).rejects.toThrow();
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("skips missing installed packages instead of aborting the whole run", async () => {
    const cwd = await createTempProject();
    const { logger, messages } = createLogger();

    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        installed: "1.0.0",
        "not-installed": "1.0.0",
      },
      peerDependencies: {
        "peer-not-installed": "1.0.0",
      },
    });
    await writeJson(path.join(cwd, "node_modules/installed/package.json"), {
      name: "installed",
      version: "1.0.0",
    });
    await writeFile(
      path.join(cwd, "node_modules/installed/skills/alpha/SKILL.md"),
      "# Alpha\n",
    );

    const report = await extractSkills({ cwd, logger });

    expect(report.extracted.map((entry) => entry.destinationName)).toEqual([
      "installed-alpha",
    ]);
    expect(report.skipped.map((entry) => entry.reason)).toEqual([
      "missing-package",
      "missing-package",
    ]);
    expect(messages.warn).toEqual([
      "Skipped not-installed because it could not be resolved from node_modules.",
      "Skipped peer-not-installed because it could not be resolved from node_modules.",
    ]);
  });

  it("extracts nested skills and respects overrides", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "@bluelibs/runner": "1.0.0",
        "plain-package": "1.0.0",
      },
      npmSkills: {
        consume: {
          map: {
            "@bluelibs/runner": ".agents/skills",
          },
        },
      },
    });

    await writeJson(
      path.join(cwd, "node_modules/@bluelibs/runner/package.json"),
      {
        name: "@bluelibs/runner",
        version: "1.0.0",
      },
    );
    await writeFile(
      path.join(
        cwd,
        "node_modules/@bluelibs/runner/.agents/skills/release/SKILL.md",
      ),
      "# Release\n",
    );
    await writeFile(
      path.join(
        cwd,
        "node_modules/@bluelibs/runner/.agents/skills/release/template.txt",
      ),
      "ship it",
    );

    await writeJson(path.join(cwd, "node_modules/plain-package/package.json"), {
      name: "plain-package",
      version: "1.0.0",
    });
    await writeFile(
      path.join(cwd, "node_modules/plain-package/skills/writing/SKILL.md"),
      "# Writing\n",
    );

    const { logger, messages } = createLogger();
    const firstReport = await extractSkills({ cwd, logger });

    expect(firstReport.scannedPackages).toEqual([
      "@bluelibs/runner",
      "plain-package",
    ]);
    expect(firstReport.extracted.map((entry) => entry.destinationName)).toEqual(
      ["bluelibs-runner-release", "plain-package-writing"],
    );
    expect(
      await fs.readFile(
        path.join(cwd, ".agents/skills/bluelibs-runner-release/template.txt"),
        "utf8",
      ),
    ).toBe("ship it");
    expect(messages.info).toEqual([
      "Extracted bluelibs-runner-release",
      "Extracted plain-package-writing",
    ]);

    await writeFile(
      path.join(cwd, ".agents/skills/bluelibs-runner-release/local.txt"),
      "old content",
    );
    await writeFile(
      path.join(
        cwd,
        "node_modules/@bluelibs/runner/.agents/skills/release/template.txt",
      ),
      "fresh content",
    );

    const prompt: OverwritePrompt = {
      confirmOverwrite: jest.fn().mockResolvedValue(true),
    };

    const secondReport = await extractSkills({
      cwd,
      logger,
      only: ["@bluelibs/*"],
      prompt,
    });

    expect(
      secondReport.extracted.map((entry) => entry.destinationName),
    ).toEqual(["bluelibs-runner-release"]);
    expect(
      await fs.readFile(
        path.join(cwd, ".agents/skills/bluelibs-runner-release/template.txt"),
        "utf8",
      ),
    ).toBe("fresh content");
    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/bluelibs-runner-release/local.txt"),
        "utf8",
      ),
    ).rejects.toThrow();
    expect(prompt.confirmOverwrite).toHaveBeenCalledTimes(1);
  });

  it("skips existing skills when overwrite is declined", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "pkg-a": "1.0.0",
      },
    });

    await writeJson(path.join(cwd, "node_modules/pkg-a/package.json"), {
      name: "pkg-a",
      version: "1.0.0",
    });
    await writeFile(
      path.join(cwd, "node_modules/pkg-a/skills/alpha/SKILL.md"),
      "# A\n",
    );
    await writeFile(
      path.join(cwd, ".agents/skills/pkg-a-alpha/SKILL.md"),
      "# Existing A\n",
    );

    const { logger, messages } = createLogger();
    const prompt: OverwritePrompt = {
      confirmOverwrite: jest.fn().mockResolvedValue(false),
    };

    const report = await extractSkills({
      cwd,
      packageNames: ["pkg-a"],
      prompt,
      logger,
    });

    expect(report.extracted).toHaveLength(0);
    expect(report.skipped.map((entry) => entry.reason)).toEqual(["declined"]);
    expect(messages.warn).toEqual([
      "Skipped pkg-a-alpha because overwrite was declined.",
    ]);
  });

  it("does not start managing existing folders when overwrite is declined", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "pkg-a": "1.0.0",
      },
    });

    await writeJson(path.join(cwd, "node_modules/pkg-a/package.json"), {
      name: "pkg-a",
      version: "1.0.0",
    });
    await writeFile(
      path.join(cwd, "node_modules/pkg-a/skills/alpha/SKILL.md"),
      "# Managed source\n",
    );
    await writeFile(
      path.join(cwd, ".agents/skills/pkg-a-alpha/SKILL.md"),
      "# Manual destination\n",
    );

    await extractSkills({
      cwd,
      prompt: {
        confirmOverwrite: jest.fn().mockResolvedValue(false),
      },
    });
    await fs.rm(path.join(cwd, "node_modules/pkg-a/skills/alpha"), {
      recursive: true,
      force: true,
    });

    await extractSkills({
      cwd,
      override: true,
    });

    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/pkg-a-alpha/SKILL.md"),
        "utf8",
      ),
    ).resolves.toBe("# Manual destination\n");
  });

  it("keeps managed destinations in the manifest when overwrite is declined", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "pkg-a": "1.0.0",
      },
    });

    await writeJson(path.join(cwd, "node_modules/pkg-a/package.json"), {
      name: "pkg-a",
      version: "1.0.0",
    });
    await writeFile(
      path.join(cwd, "node_modules/pkg-a/skills/alpha/SKILL.md"),
      "# Source\n",
    );

    await extractSkills({
      cwd,
      override: true,
    });
    await extractSkills({
      cwd,
      prompt: {
        confirmOverwrite: jest.fn().mockResolvedValue(false),
      },
    });

    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/.npm-skills-manifest.json"),
        "utf8",
      ),
    ).resolves.toContain('"pkg-a-alpha"');
  });

  it("skips existing skills in non-interactive mode", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "pkg-b": "1.0.0",
      },
    });

    await writeJson(path.join(cwd, "node_modules/pkg-b/package.json"), {
      name: "pkg-b",
      version: "1.0.0",
    });
    await writeFile(
      path.join(cwd, "node_modules/pkg-b/skills/beta/SKILL.md"),
      "# B\n",
    );
    await writeFile(
      path.join(cwd, ".agents/skills/pkg-b-beta/SKILL.md"),
      "# Existing B\n",
    );

    const { logger, messages } = createLogger();
    const report = await extractSkills({
      cwd,
      packageNames: ["pkg-b"],
      logger,
    });

    expect(report.extracted).toHaveLength(0);
    expect(report.skipped.map((entry) => entry.reason)).toEqual([
      "non-interactive",
    ]);
    expect(messages.warn).toEqual([
      "Skipped pkg-b-beta because it already exists. Re-run with --override in non-interactive mode.",
    ]);
  });

  it("keeps managed destinations in the manifest in non-interactive mode", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "pkg-b": "1.0.0",
      },
    });

    await writeJson(path.join(cwd, "node_modules/pkg-b/package.json"), {
      name: "pkg-b",
      version: "1.0.0",
    });
    await writeFile(
      path.join(cwd, "node_modules/pkg-b/skills/beta/SKILL.md"),
      "# Source\n",
    );

    await extractSkills({
      cwd,
      override: true,
    });
    await extractSkills({
      cwd,
    });

    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/.npm-skills-manifest.json"),
        "utf8",
      ),
    ).resolves.toContain('"pkg-b-beta"');
  });

  it("supports default root skills folders, override mode, and missing sources", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "default-root": "1.0.0",
      },
      devDependencies: {
        "dev-only": "1.0.0",
      },
      peerDependencies: {
        "missing-skills": "1.0.0",
      },
      npmSkills: {
        consume: {
          only: ["default-*", "dev-*", "missing-*"],
        },
      },
    });

    await writeJson(path.join(cwd, "node_modules/default-root/package.json"), {
      name: "default-root",
      version: "1.0.0",
    });
    await writeJson(path.join(cwd, "node_modules/dev-only/package.json"), {
      name: "dev-only",
      version: "1.0.0",
    });
    await writeJson(
      path.join(cwd, "node_modules/missing-skills/package.json"),
      {
        name: "missing-skills",
        version: "1.0.0",
      },
    );

    await writeFile(
      path.join(cwd, "node_modules/default-root/skills/SKILL.md"),
      "# Root\n",
    );
    await writeFile(
      path.join(cwd, "node_modules/dev-only/skills/dev/SKILL.md"),
      "# Dev\n",
    );
    await writeFile(
      path.join(cwd, ".agents/skills/default-root-skills/old.txt"),
      "remove me",
    );

    const { logger, messages } = createLogger();
    const report = await extractSkills({
      cwd,
      logger,
      override: true,
    });

    expect(report.scannedPackages).toEqual([
      "default-root",
      "dev-only",
      "missing-skills",
    ]);
    expect(report.extracted.map((entry) => entry.destinationName)).toEqual([
      "default-root-skills",
      "dev-only-dev",
    ]);
    expect(report.skipped.map((entry) => entry.reason)).toEqual([
      "missing-source",
    ]);
    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/default-root-skills/old.txt"),
        "utf8",
      ),
    ).rejects.toThrow();
    expect(messages.warn).toEqual([
      expect.stringContaining("No skills found for missing-skills"),
    ]);

    const noDevReport = await extractSkills({
      cwd,
      logger,
      includeDevDependencies: false,
      override: true,
    });

    expect(noDevReport.scannedPackages).toEqual([
      "default-root",
      "missing-skills",
    ]);
  });

  it("respects package export whitelists and package opt-out", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "with-exports": "1.0.0",
        "opted-out": "1.0.0",
      },
    });

    await writeJson(path.join(cwd, "node_modules/with-exports/package.json"), {
      name: "with-exports",
      version: "1.0.0",
      npmSkills: {
        publish: {
          export: ["runner"],
        },
      },
    });
    await writeFile(
      path.join(cwd, "node_modules/with-exports/skills/runner/core/SKILL.md"),
      "# Runner Core\n",
    );
    await writeFile(
      path.join(
        cwd,
        "node_modules/with-exports/skills/runner/advanced/SKILL.md",
      ),
      "# Runner Advanced\n",
    );
    await writeFile(
      path.join(cwd, "node_modules/with-exports/skills/internal/SKILL.md"),
      "# Internal\n",
    );

    await writeJson(path.join(cwd, "node_modules/opted-out/package.json"), {
      name: "opted-out",
      version: "1.0.0",
      npmSkills: false,
    });
    await writeFile(
      path.join(cwd, "node_modules/opted-out/skills/hidden/SKILL.md"),
      "# Hidden\n",
    );

    const { logger, messages } = createLogger();
    const report = await extractSkills({
      cwd,
      logger,
      override: true,
    });

    expect(report.extracted.map((entry) => entry.destinationName)).toEqual([
      "with-exports-runner--advanced",
      "with-exports-runner--core",
    ]);
    expect(report.skipped.map((entry) => entry.reason)).toEqual([
      "package-opt-out",
    ]);
    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/with-exports-internal/SKILL.md"),
        "utf8",
      ),
    ).rejects.toThrow();
    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/opted-out-hidden/SKILL.md"),
        "utf8",
      ),
    ).rejects.toThrow();
    expect(messages.warn).toEqual([
      "Skipped opted-out because the package disabled skill export.",
    ]);
  });

  it("supports package-side dir and exports metadata", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "package-policy": "1.0.0",
      },
    });

    await writeJson(
      path.join(cwd, "node_modules/package-policy/package.json"),
      {
        name: "package-policy",
        version: "1.0.0",
        npmSkills: {
          publish: {
            source: "my-skillz",
            export: ["runner"],
          },
        },
      },
    );
    await writeFile(
      path.join(
        cwd,
        "node_modules/package-policy/my-skillz/runner/core/SKILL.md",
      ),
      "# Core\n",
    );
    await writeFile(
      path.join(
        cwd,
        "node_modules/package-policy/my-skillz/internal/hidden/SKILL.md",
      ),
      "# Hidden\n",
    );

    const report = await extractSkills({
      cwd,
      override: true,
    });

    expect(report.extracted.map((entry) => entry.destinationName)).toEqual([
      "package-policy-runner--core",
    ]);
    await expect(
      fs.readFile(
        path.join(
          cwd,
          ".agents/skills/package-policy-internal--hidden/SKILL.md",
        ),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("supports packages that export an entrypoint but not ./package.json", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "exports-only": "1.0.0",
      },
    });

    await writeJson(path.join(cwd, "node_modules/exports-only/package.json"), {
      name: "exports-only",
      version: "1.0.0",
      npmSkills: {
        publish: {
          source: "my-skillz",
          export: ["runner"],
        },
      },
    });
    await writeFile(
      path.join(cwd, "node_modules/exports-only/index.js"),
      'module.exports = "ok";\n',
    );
    await writeFile(
      path.join(
        cwd,
        "node_modules/exports-only/my-skillz/runner/core/SKILL.md",
      ),
      "# Core\n",
    );
    jest.spyOn(nodeModule, "createRequire").mockReturnValue({
      resolve(specifier: string) {
        if (specifier === "exports-only/package.json") {
          const error = new Error("not exported") as NodeJS.ErrnoException;
          error.code = "ERR_PACKAGE_PATH_NOT_EXPORTED";
          throw error;
        }

        if (specifier === "exports-only") {
          const error = new Error("not found") as NodeJS.ErrnoException;
          error.code = "MODULE_NOT_FOUND";
          throw error;
        }

        throw new Error(`Unexpected specifier: ${specifier}`);
      },
    } as never);

    const report = await extractSkills({
      cwd,
      override: true,
    });

    expect(report.extracted.map((entry) => entry.destinationName)).toEqual([
      "exports-only-runner--core",
    ]);
  });

  it("supports exported packages by finding package.json above the resolved entrypoint", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "exports-upward": "1.0.0",
      },
    });

    await writeJson(
      path.join(cwd, "node_modules/exports-upward/package.json"),
      {
        name: "exports-upward",
        version: "1.0.0",
        npmSkills: {
          publish: {
            source: "my-skillz",
            export: ["runner"],
          },
        },
      },
    );
    await writeFile(
      path.join(cwd, "node_modules/exports-upward/dist/index.js"),
      'module.exports = "ok";\n',
    );
    await writeFile(
      path.join(
        cwd,
        "node_modules/exports-upward/my-skillz/runner/core/SKILL.md",
      ),
      "# Core\n",
    );
    jest.spyOn(nodeModule, "createRequire").mockReturnValue({
      resolve(specifier: string) {
        if (specifier === "exports-upward/package.json") {
          const error = new Error("not exported") as NodeJS.ErrnoException;
          error.code = "ERR_PACKAGE_PATH_NOT_EXPORTED";
          throw error;
        }

        if (specifier === "exports-upward") {
          return path.join(cwd, "node_modules/exports-upward/dist/index.js");
        }

        throw new Error(`Unexpected specifier: ${specifier}`);
      },
    } as never);

    const report = await extractSkills({
      cwd,
      override: true,
    });

    expect(report.extracted.map((entry) => entry.destinationName)).toEqual([
      "exports-upward-runner--core",
    ]);
  });

  it("supports exported packages when the fallback entrypoint resolves to a directory", async () => {
    const cwd = await createTempProject();
    const detachedDir = await createTempProject();

    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "exports-dir": "1.0.0",
      },
    });

    await writeJson(path.join(cwd, "node_modules/exports-dir/package.json"), {
      name: "exports-dir",
      version: "1.0.0",
      npmSkills: {
        publish: {
          source: "my-skillz",
          export: ["runner"],
        },
      },
    });
    await writeFile(
      path.join(cwd, "node_modules/exports-dir/my-skillz/runner/core/SKILL.md"),
      "# Core\n",
    );
    jest.spyOn(nodeModule, "createRequire").mockReturnValue({
      resolve(specifier: string) {
        if (specifier === "exports-dir/package.json") {
          const error = new Error("not exported") as NodeJS.ErrnoException;
          error.code = "ERR_PACKAGE_PATH_NOT_EXPORTED";
          throw error;
        }

        if (specifier === "exports-dir") {
          return detachedDir;
        }

        throw new Error(`Unexpected specifier: ${specifier}`);
      },
    } as never);

    const report = await extractSkills({
      cwd,
      override: true,
    });

    expect(report.extracted.map((entry) => entry.destinationName)).toEqual([
      "exports-dir-runner--core",
    ]);
  });

  it("supports exported packages when only the realpath node_modules candidate exists", async () => {
    const cwd = await createTempProject();
    const originalAccess = fs.access;

    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "exports-realpath": "1.0.0",
      },
    });

    await writeJson(
      path.join(cwd, "node_modules/exports-realpath/package.json"),
      {
        name: "exports-realpath",
        version: "1.0.0",
        npmSkills: {
          publish: {
            source: "my-skillz",
            export: ["runner"],
          },
        },
      },
    );
    await writeFile(
      path.join(
        cwd,
        "node_modules/exports-realpath/my-skillz/runner/core/SKILL.md",
      ),
      "# Core\n",
    );
    jest.spyOn(fs, "access").mockImplementation(async (targetPath, mode) => {
      const directCandidate = path.join(
        cwd,
        "node_modules/exports-realpath/package.json",
      );

      if (String(targetPath) === directCandidate) {
        const error = new Error("missing") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }

      return originalAccess(targetPath, mode);
    });
    jest.spyOn(nodeModule, "createRequire").mockReturnValue({
      resolve(specifier: string) {
        if (specifier === "exports-realpath/package.json") {
          const error = new Error("not exported") as NodeJS.ErrnoException;
          error.code = "ERR_PACKAGE_PATH_NOT_EXPORTED";
          throw error;
        }

        if (specifier === "exports-realpath") {
          const error = new Error("not found") as NodeJS.ErrnoException;
          error.code = "MODULE_NOT_FOUND";
          throw error;
        }

        throw new Error(`Unexpected specifier: ${specifier}`);
      },
    } as never);

    const report = await extractSkills({
      cwd,
      override: true,
    });

    expect(report.extracted.map((entry) => entry.destinationName)).toEqual([
      "exports-realpath-runner--core",
    ]);
  });

  it("supports export whitelisting for root-level skills", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "root-export": "1.0.0",
      },
    });

    await writeJson(path.join(cwd, "node_modules/root-export/package.json"), {
      name: "root-export",
      version: "1.0.0",
      npmSkills: {
        publish: {
          export: ["skills"],
        },
      },
    });
    await writeFile(
      path.join(cwd, "node_modules/root-export/skills/SKILL.md"),
      "# Root Export\n",
    );

    const report = await extractSkills({
      cwd,
      override: true,
    });

    expect(report.extracted.map((entry) => entry.destinationName)).toEqual([
      "root-export-skills",
    ]);
  });

  it("prunes stale managed skills on full default syncs without touching unrelated folders", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "@bluelibs/runner": "1.0.0",
        "plain-package": "1.0.0",
      },
    });

    await writeJson(
      path.join(cwd, "node_modules/@bluelibs/runner/package.json"),
      {
        name: "@bluelibs/runner",
        version: "1.0.0",
      },
    );
    await writeFile(
      path.join(cwd, "node_modules/@bluelibs/runner/skills/release/SKILL.md"),
      "# Release\n",
    );

    await writeJson(path.join(cwd, "node_modules/plain-package/package.json"), {
      name: "plain-package",
      version: "1.0.0",
    });
    await writeFile(
      path.join(cwd, "node_modules/plain-package/skills/writing/SKILL.md"),
      "# Writing\n",
    );

    await extractSkills({
      cwd,
      override: true,
    });
    await writeFile(
      path.join(cwd, ".agents/skills/local-playground/notes.txt"),
      "keep me",
    );
    await fs.rm(
      path.join(cwd, "node_modules/@bluelibs/runner/skills/release"),
      {
        recursive: true,
        force: true,
      },
    );

    const { logger, messages } = createLogger();
    const report = await extractSkills({
      cwd,
      logger,
      override: true,
    });

    expect(report.extracted.map((entry) => entry.destinationName)).toEqual([
      "plain-package-writing",
    ]);
    expect(report.skipped.map((entry) => entry.reason)).toEqual([
      "missing-source",
    ]);
    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/bluelibs-runner-release/SKILL.md"),
        "utf8",
      ),
    ).rejects.toThrow();
    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/local-playground/notes.txt"),
        "utf8",
      ),
    ).resolves.toBe("keep me");
    expect(messages.info).toContain("Removed stale bluelibs-runner-release");
    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/.npm-skills-manifest.json"),
        "utf8",
      ),
    ).resolves.toContain('"plain-package-writing"');
  });

  it("does not prune stale managed skills during targeted syncs", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "@bluelibs/runner": "1.0.0",
        "plain-package": "1.0.0",
      },
    });

    await writeJson(
      path.join(cwd, "node_modules/@bluelibs/runner/package.json"),
      {
        name: "@bluelibs/runner",
        version: "1.0.0",
      },
    );
    await writeFile(
      path.join(cwd, "node_modules/@bluelibs/runner/skills/release/SKILL.md"),
      "# Release\n",
    );

    await writeJson(path.join(cwd, "node_modules/plain-package/package.json"), {
      name: "plain-package",
      version: "1.0.0",
    });
    await writeFile(
      path.join(cwd, "node_modules/plain-package/skills/writing/SKILL.md"),
      "# Writing\n",
    );

    await extractSkills({
      cwd,
      override: true,
    });
    await fs.rm(
      path.join(cwd, "node_modules/@bluelibs/runner/skills/release"),
      {
        recursive: true,
        force: true,
      },
    );

    await extractSkills({
      cwd,
      packageNames: ["plain-package"],
      override: true,
    });

    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/bluelibs-runner-release/SKILL.md"),
        "utf8",
      ),
    ).resolves.toBe("# Release\n");
  });

  it("does not prune stale managed skills in custom output directories", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        "plain-package": "1.0.0",
      },
    });

    await writeJson(path.join(cwd, "node_modules/plain-package/package.json"), {
      name: "plain-package",
      version: "1.0.0",
    });
    await writeFile(
      path.join(cwd, "node_modules/plain-package/skills/writing/SKILL.md"),
      "# Writing\n",
    );

    await extractSkills({
      cwd,
      outputDir: "shared-skills",
      override: true,
    });
    await fs.rm(path.join(cwd, "node_modules/plain-package/skills/writing"), {
      recursive: true,
      force: true,
    });

    await extractSkills({
      cwd,
      outputDir: "shared-skills",
      override: true,
    });

    await expect(
      fs.readFile(
        path.join(cwd, "shared-skills/plain-package-writing/SKILL.md"),
        "utf8",
      ),
    ).resolves.toBe("# Writing\n");
  });

  it("keeps previously extracted skills when a package is temporarily unresolved", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        installed: "1.0.0",
      },
    });

    await writeJson(path.join(cwd, "node_modules/installed/package.json"), {
      name: "installed",
      version: "1.0.0",
    });
    await writeFile(
      path.join(cwd, "node_modules/installed/skills/alpha/SKILL.md"),
      "# Alpha\n",
    );

    await extractSkills({
      cwd,
      override: true,
    });
    await fs.rm(path.join(cwd, "node_modules/installed"), {
      recursive: true,
      force: true,
    });

    const { logger, messages } = createLogger();
    const report = await extractSkills({
      cwd,
      logger,
      override: true,
    });

    expect(report.skipped.map((entry) => entry.reason)).toEqual([
      "missing-package",
    ]);
    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/installed-alpha/SKILL.md"),
        "utf8",
      ),
    ).resolves.toBe("# Alpha\n");
    expect(messages.warn).toEqual([
      "Skipped installed because it could not be resolved from node_modules.",
    ]);
    await expect(
      fs.readFile(
        path.join(cwd, ".agents/skills/.npm-skills-manifest.json"),
        "utf8",
      ),
    ).resolves.toContain('"installed-alpha"');
  });

  it("uses collision-proof names for nested and dashed skill paths", async () => {
    const cwd = await createTempProject();
    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        collisions: "1.0.0",
      },
    });

    await writeJson(path.join(cwd, "node_modules/collisions/package.json"), {
      name: "collisions",
      version: "1.0.0",
    });
    await writeFile(
      path.join(cwd, "node_modules/collisions/skills/foo-bar/SKILL.md"),
      "# Dashed\n",
    );
    await writeFile(
      path.join(cwd, "node_modules/collisions/skills/foo/bar/SKILL.md"),
      "# Nested\n",
    );

    const report = await extractSkills({
      cwd,
      override: true,
    });

    expect(report.extracted.map((entry) => entry.destinationName)).toEqual([
      "collisions-foo--bar",
      "collisions-foo-bar",
    ]);
  });

  it("rethrows unexpected filesystem access errors", async () => {
    const cwd = await createTempProject();
    const originalAccess = fs.access;
    const permissionError = Object.assign(new Error("denied"), {
      code: "EACCES",
    });

    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        broken: "1.0.0",
      },
    });
    await writeJson(path.join(cwd, "node_modules/broken/package.json"), {
      name: "broken",
      version: "1.0.0",
    });

    jest.spyOn(fs, "access").mockImplementation(async (targetPath, mode) => {
      if (endsWithPath(targetPath, "node_modules", "broken", "skills")) {
        throw permissionError;
      }

      return originalAccess(targetPath, mode);
    });

    await expect(extractSkills({ cwd })).rejects.toBe(permissionError);
  });

  it("rethrows unexpected manifest read errors", async () => {
    const cwd = await createTempProject();
    const originalReadFile = fs.readFile;
    const manifestError = Object.assign(new Error("manifest denied"), {
      code: "EACCES",
    });

    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {},
    });

    jest
      .spyOn(fs, "readFile")
      .mockImplementation(async (targetPath, options) => {
        if (
          endsWithPath(
            targetPath,
            ".agents",
            "skills",
            ".npm-skills-manifest.json",
          )
        ) {
          throw manifestError;
        }

        return originalReadFile(targetPath, options as never);
      });

    await expect(extractSkills({ cwd })).rejects.toBe(manifestError);
  });

  it("rethrows unexpected package resolution errors", async () => {
    const cwd = await createTempProject();
    const resolutionError = Object.assign(new Error("resolver broke"), {
      code: "EACCES",
    });

    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        broken: "1.0.0",
      },
    });

    jest.spyOn(nodeModule, "createRequire").mockReturnValue({
      resolve() {
        throw resolutionError;
      },
    } as never);

    await expect(extractSkills({ cwd })).rejects.toBe(resolutionError);
  });

  it("rethrows unexpected entrypoint resolution errors after package.json is not exported", async () => {
    const cwd = await createTempProject();
    const resolutionError = Object.assign(new Error("entrypoint broke"), {
      code: "EACCES",
    });

    await writeJson(path.join(cwd, "package.json"), {
      name: "consumer",
      dependencies: {
        broken: "1.0.0",
      },
    });

    jest.spyOn(nodeModule, "createRequire").mockReturnValue({
      resolve(specifier: string) {
        if (specifier === "broken/package.json") {
          const error = new Error("not exported") as NodeJS.ErrnoException;
          error.code = "ERR_PACKAGE_PATH_NOT_EXPORTED";
          throw error;
        }

        if (specifier === "broken") {
          throw resolutionError;
        }

        throw new Error(`Unexpected specifier: ${specifier}`);
      },
    } as never);

    await expect(extractSkills({ cwd })).rejects.toBe(resolutionError);
  });
});
