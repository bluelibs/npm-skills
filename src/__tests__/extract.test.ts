import * as fs from "node:fs/promises";
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
        "missing-package": "1.0.0",
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
      path.join(cwd, "node_modules/missing-package/package.json"),
      {
        name: "missing-package",
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
        await fs.realpath(path.join(cwd, "skills")),
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
      expect.stringContaining("No skills found for missing-package"),
    );
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
        custom: {
          "@bluelibs/runner": ".agents/skills",
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
        path.join(cwd, "skills/bluelibs-runner-release/template.txt"),
        "utf8",
      ),
    ).toBe("ship it");
    expect(messages.info).toEqual([
      "Extracted bluelibs-runner-release",
      "Extracted plain-package-writing",
    ]);

    await writeFile(
      path.join(cwd, "skills/bluelibs-runner-release/local.txt"),
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
        path.join(cwd, "skills/bluelibs-runner-release/template.txt"),
        "utf8",
      ),
    ).toBe("fresh content");
    await expect(
      fs.readFile(
        path.join(cwd, "skills/bluelibs-runner-release/local.txt"),
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
      path.join(cwd, "skills/pkg-a-alpha/SKILL.md"),
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
      path.join(cwd, "skills/pkg-b-beta/SKILL.md"),
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
      "npm-skills": {
        only: ["default-*", "dev-*", "missing-*"],
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
      path.join(cwd, "skills/default-root-skills/old.txt"),
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
      fs.readFile(path.join(cwd, "skills/default-root-skills/old.txt"), "utf8"),
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
        export: ["runner"],
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
      "with-exports-runner-advanced",
      "with-exports-runner-core",
    ]);
    expect(report.skipped.map((entry) => entry.reason)).toEqual([
      "package-opt-out",
    ]);
    await expect(
      fs.readFile(
        path.join(cwd, "skills/with-exports-internal/SKILL.md"),
        "utf8",
      ),
    ).rejects.toThrow();
    await expect(
      fs.readFile(path.join(cwd, "skills/opted-out-hidden/SKILL.md"), "utf8"),
    ).rejects.toThrow();
    expect(messages.warn).toEqual([
      "Skipped opted-out because the package disabled skill export.",
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
        export: ["skills"],
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
});
