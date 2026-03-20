import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { syncSkillPublishRefs } from "../refs";

async function createTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "npm-skills-refs-"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

describe("refs", () => {
  it("materializes and restores configured publish refs", async () => {
    const cwd = await createTempProject();
    const sourceDir = path.join(cwd, "readmes");
    const destinationDir = path.join(
      cwd,
      "skills",
      "core",
      "references",
      "readmes",
    );

    await writeJson(path.join(cwd, "package.json"), {
      name: "fixture",
      npmSkills: {
        publish: {
          refs: [
            {
              source: "readmes",
              destination: "skills/core/references/readmes",
            },
          ],
        },
      },
    });
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "README.md"), "# Shared\n");

    const materializeReport = await syncSkillPublishRefs({
      cwd,
      mode: "materialize",
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
      },
    });

    expect(materializeReport).toEqual({
      mode: "materialize",
      synced: [
        {
          sourcePath: sourceDir,
          destinationPath: destinationDir,
        },
      ],
    });
    await expect(
      fs.readFile(path.join(destinationDir, "README.md"), "utf8"),
    ).resolves.toBe("# Shared\n");
    expect((await fs.lstat(destinationDir)).isSymbolicLink()).toBe(false);

    await fs.writeFile(path.join(destinationDir, "README.md"), "# Packed\n");

    const restoreReport = await syncSkillPublishRefs({
      cwd,
      mode: "restore",
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
      },
    });

    expect(restoreReport).toEqual({
      mode: "restore",
      synced: [
        {
          sourcePath: sourceDir,
          destinationPath: destinationDir,
        },
      ],
    });
    expect((await fs.lstat(destinationDir)).isSymbolicLink()).toBe(true);
    await expect(fs.readlink(destinationDir)).resolves.toBe("../../../readmes");
  });

  it("fails fast when a ref source escapes the project directory", async () => {
    const cwd = await createTempProject();

    await writeJson(path.join(cwd, "package.json"), {
      name: "fixture",
      npmSkills: {
        publish: {
          refs: [
            {
              source: "../outside",
              destination: "skills/core/references/readmes",
            },
          ],
        },
      },
    });

    await expect(
      syncSkillPublishRefs({
        cwd,
        mode: "materialize",
      }),
    ).rejects.toThrow("Ref source must stay within the project directory");
  });

  it("fails fast when a ref source is missing", async () => {
    const cwd = await createTempProject();

    await writeJson(path.join(cwd, "package.json"), {
      name: "fixture",
      npmSkills: {
        publish: {
          refs: [
            {
              source: "readmes",
              destination: "skills/core/references/readmes",
            },
          ],
        },
      },
    });

    await expect(
      syncSkillPublishRefs({
        cwd,
        mode: "restore",
      }),
    ).rejects.toThrow("Ref source does not exist: readmes");
  });

  it("restores file refs and uses the default logger when one is not provided", async () => {
    const cwd = await createTempProject();
    const sourceFile = path.join(cwd, "docs", "guide.md");
    const destinationFile = path.join(
      cwd,
      "skills",
      "core",
      "references",
      "guide.md",
    );
    const logSpy = jest
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await writeJson(path.join(cwd, "package.json"), {
      name: "fixture",
      npmSkills: {
        publish: {
          refs: [
            {
              source: "docs/guide.md",
              destination: "skills/core/references/guide.md",
            },
          ],
        },
      },
    });
    await fs.mkdir(path.dirname(sourceFile), { recursive: true });
    await fs.writeFile(sourceFile, "# Guide\n");

    await expect(
      syncSkillPublishRefs({
        cwd,
        mode: "restore",
      }),
    ).resolves.toEqual({
      mode: "restore",
      synced: [
        {
          sourcePath: sourceFile,
          destinationPath: destinationFile,
        },
      ],
    });

    expect((await fs.lstat(destinationFile)).isSymbolicLink()).toBe(true);
    await expect(fs.readlink(destinationFile)).resolves.toBe(
      "../../../docs/guide.md",
    );
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("fails fast when a ref points to the same source and destination", async () => {
    const cwd = await createTempProject();

    await writeJson(path.join(cwd, "package.json"), {
      name: "fixture",
      npmSkills: {
        publish: {
          refs: [
            {
              source: "readmes",
              destination: "readmes",
            },
          ],
        },
      },
    });
    await fs.mkdir(path.join(cwd, "readmes"), { recursive: true });

    await expect(
      syncSkillPublishRefs({
        cwd,
        mode: "restore",
      }),
    ).rejects.toThrow("Ref source and destination must differ: readmes");
  });

  it("rethrows unexpected access errors while checking ref sources", async () => {
    const cwd = await createTempProject();
    const accessSpy = jest.spyOn(fs, "access").mockRejectedValue(
      Object.assign(new Error("permission denied"), {
        code: "EPERM",
      }),
    );

    await writeJson(path.join(cwd, "package.json"), {
      name: "fixture",
      npmSkills: {
        publish: {
          refs: [
            {
              source: "readmes",
              destination: "skills/core/references/readmes",
            },
          ],
        },
      },
    });

    await expect(
      syncSkillPublishRefs({
        cwd,
        mode: "materialize",
      }),
    ).rejects.toThrow("permission denied");
    expect(accessSpy).toHaveBeenCalled();
  });

  it("uses process.cwd when cwd is omitted", async () => {
    const cwd = await createTempProject();
    const originalCwd = process.cwd();

    await writeJson(path.join(cwd, "package.json"), {
      name: "fixture",
      npmSkills: {
        publish: {
          refs: [],
        },
      },
    });

    process.chdir(cwd);
    try {
      await expect(
        syncSkillPublishRefs({
          mode: "materialize",
          logger: {
            info: jest.fn(),
            warn: jest.fn(),
          },
        }),
      ).resolves.toEqual({
        mode: "materialize",
        synced: [],
      });
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("uses Windows junctions for directory refs", async () => {
    const cwd = await createTempProject();
    const originalPlatform = process.platform;
    const sourceDir = path.join(cwd, "readmes");
    const destinationDir = path.join(
      cwd,
      "skills",
      "core",
      "references",
      "readmes",
    );
    const symlinkSpy = jest
      .spyOn(fs, "symlink")
      .mockResolvedValue(undefined as never);

    await writeJson(path.join(cwd, "package.json"), {
      name: "fixture",
      npmSkills: {
        publish: {
          refs: [
            {
              source: "readmes",
              destination: "skills/core/references/readmes",
            },
          ],
        },
      },
    });
    await fs.mkdir(sourceDir, { recursive: true });

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    try {
      await expect(
        syncSkillPublishRefs({
          cwd,
          mode: "restore",
          logger: {
            info: jest.fn(),
            warn: jest.fn(),
          },
        }),
      ).resolves.toEqual({
        mode: "restore",
        synced: [
          {
            sourcePath: sourceDir,
            destinationPath: destinationDir,
          },
        ],
      });
    } finally {
      Object.defineProperty(process, "platform", {
        configurable: true,
        value: originalPlatform,
      });
    }

    expect(symlinkSpy).toHaveBeenCalledWith(
      sourceDir,
      destinationDir,
      "junction",
    );
  });

  it("uses Windows file symlinks with absolute targets for file refs", async () => {
    const cwd = await createTempProject();
    const originalPlatform = process.platform;
    const sourceFile = path.join(cwd, "docs", "guide.md");
    const destinationFile = path.join(
      cwd,
      "skills",
      "core",
      "references",
      "guide.md",
    );
    const symlinkSpy = jest
      .spyOn(fs, "symlink")
      .mockResolvedValue(undefined as never);

    await writeJson(path.join(cwd, "package.json"), {
      name: "fixture",
      npmSkills: {
        publish: {
          refs: [
            {
              source: "docs/guide.md",
              destination: "skills/core/references/guide.md",
            },
          ],
        },
      },
    });
    await fs.mkdir(path.dirname(sourceFile), { recursive: true });
    await fs.writeFile(sourceFile, "# Guide\n");

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    try {
      await expect(
        syncSkillPublishRefs({
          cwd,
          mode: "restore",
          logger: {
            info: jest.fn(),
            warn: jest.fn(),
          },
        }),
      ).resolves.toEqual({
        mode: "restore",
        synced: [
          {
            sourcePath: sourceFile,
            destinationPath: destinationFile,
          },
        ],
      });
    } finally {
      Object.defineProperty(process, "platform", {
        configurable: true,
        value: originalPlatform,
      });
    }

    expect(symlinkSpy).toHaveBeenCalledWith(
      sourceFile,
      destinationFile,
      "file",
    );
  });
});
