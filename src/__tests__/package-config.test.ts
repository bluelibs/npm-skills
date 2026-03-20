import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_POLICY_FILE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_SKILLS_DIR,
  getDependencyPackageNames,
  getDependencySections,
  getPackageSkillSourceDir,
  readInstalledPackageJson,
  readProjectNpmSkillsConfig,
  resolvePackageExportConfig,
  resolveNpmSkillsConfig,
} from "../package-config";

async function createTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "npm-skills-config-"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

describe("package-config", () => {
  it("exposes separate defaults for package sources and extraction output", () => {
    expect(DEFAULT_SKILLS_DIR).toBe("skills");
    expect(DEFAULT_OUTPUT_DIR).toBe(".agents/skills");
    expect(DEFAULT_POLICY_FILE).toBe("npm-skills.policy.json");
  });

  it("resolves consume and publish config from npmSkills", () => {
    const config = resolveNpmSkillsConfig({
      npmSkills: {
        consume: {
          only: ["consume-only"],
          output: ".agents/skills/extracted",
          map: {
            mappedConsume: ".consume/mapped-skills",
          },
        },
        publish: {
          source: ".agents/skills",
          export: ["public", "react"],
          refs: [
            {
              source: "readmes",
              destination: "skills/core/references/readmes",
            },
          ],
        },
      },
    });

    expect(config).toEqual({
      consume: {
        only: ["consume-only"],
        map: {
          mappedConsume: ".consume/mapped-skills",
        },
        output: ".agents/skills/extracted",
      },
      publish: {
        source: ".agents/skills",
        exports: ["public", "react"],
        refs: [
          {
            source: "readmes",
            destination: "skills/core/references/readmes",
          },
        ],
        disabled: false,
      },
    });
  });

  it("ignores unknown package.json keys outside npmSkills", () => {
    const packageJson = {
      npmSkills: {
        consume: {
          only: ["modern-only"],
        },
        publish: {
          source: ".modern/publish",
          export: ["modern"],
        },
      },
      randomKey: {
        consume: {
          only: ["ghosts-of-configs-past"],
        },
      },
    };

    expect(resolveNpmSkillsConfig(packageJson)).toEqual({
      consume: {
        only: ["modern-only"],
        map: {},
        output: DEFAULT_OUTPUT_DIR,
      },
      publish: {
        source: ".modern/publish",
        exports: ["modern"],
        refs: [],
        disabled: false,
      },
    });
  });

  it("falls back to consume defaults when npmSkills.consume is not an object", () => {
    expect(
      resolveNpmSkillsConfig({
        npmSkills: {
          consume: true as never,
        },
      }),
    ).toEqual({
      consume: {
        only: [],
        map: {},
        output: DEFAULT_OUTPUT_DIR,
      },
      publish: {
        source: DEFAULT_SKILLS_DIR,
        exports: [],
        refs: [],
        disabled: false,
      },
    });
  });

  it("returns dependency sections and names", () => {
    expect(getDependencySections(false)).toEqual([
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ]);
    expect(getDependencySections(true)).toEqual([
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
      "devDependencies",
    ]);

    expect(
      getDependencyPackageNames(
        {
          dependencies: { a: "1.0.0" },
          optionalDependencies: { b: "1.0.0" },
          peerDependencies: { c: "1.0.0" },
          devDependencies: { d: "1.0.0", a: "1.0.0" },
        },
        true,
      ),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("resolves mapped skill directories", () => {
    expect(
      getPackageSkillSourceDir("@bluelibs/runner", {
        only: [],
        map: {
          "@bluelibs/runner": ".mapped/skills",
        },
      }),
    ).toBe(".mapped/skills");
    expect(
      getPackageSkillSourceDir("@bluelibs/runner", {
        map: {
          "@bluelibs/runner": ".raw-consume/skills",
        },
      }),
    ).toBe(".raw-consume/skills");
    expect(
      getPackageSkillSourceDir("@bluelibs/runner", {
        output: ".agents/skills/extracted",
      }),
    ).toBe(DEFAULT_SKILLS_DIR);
    expect(
      getPackageSkillSourceDir("@bluelibs/runner", {
        consume: {
          output: DEFAULT_OUTPUT_DIR,
          map: {
            "@bluelibs/runner": ".consume/skills",
          },
        },
      }),
    ).toBe(".consume/skills");
    expect(
      getPackageSkillSourceDir("@bluelibs/runner", {
        consume: {
          output: DEFAULT_OUTPUT_DIR,
        },
      }),
    ).toBe(DEFAULT_SKILLS_DIR);
    expect(
      getPackageSkillSourceDir("@bluelibs/runner", {
        only: [],
        map: {},
      }),
    ).toBe(DEFAULT_SKILLS_DIR);
    expect(getPackageSkillSourceDir("left-pad", {})).toBe(DEFAULT_SKILLS_DIR);
  });

  it("resolves package-side export config and opt-out", () => {
    expect(resolvePackageExportConfig({ npmSkills: false })).toBe(false);
    expect(
      resolvePackageExportConfig({
        npmSkills: {
          publish: {
            source: "my-skillz",
            export: ["runner", "architecture"],
          },
        },
      }),
    ).toEqual({
      source: "my-skillz",
      exports: ["runner", "architecture"],
      refs: [],
      disabled: false,
    });
    expect(resolvePackageExportConfig({ npmSkills: true as never })).toEqual({
      source: DEFAULT_SKILLS_DIR,
      exports: [],
      refs: [],
      disabled: false,
    });
    expect(resolvePackageExportConfig({ npmSkills: {} })).toEqual({
      source: DEFAULT_SKILLS_DIR,
      exports: [],
      refs: [],
      disabled: false,
    });
    expect(
      resolvePackageExportConfig({
        npmSkills: {
          publish: {
            export: ["ok", 1 as never],
          },
        },
      }),
    ).toEqual({
      source: DEFAULT_SKILLS_DIR,
      exports: ["ok"],
      refs: [],
      disabled: false,
    });
    expect(
      resolvePackageExportConfig({
        npmSkills: {
          publish: false,
        },
      }),
    ).toBe(false);
    expect(
      resolvePackageExportConfig({
        npmSkills: {
          publish: {
            export: false,
          },
        },
      }),
    ).toBe(false);
  });

  it("filters invalid publish refs while keeping valid ones", () => {
    expect(
      resolveNpmSkillsConfig({
        npmSkills: {
          publish: {
            refs: [
              {
                source: "readmes",
                destination: "skills/core/references/readmes",
              },
              {
                source: "docs",
              } as never,
              {
                destination: "skills/core/references/docs",
              } as never,
              1 as never,
            ],
          },
        },
      }),
    ).toEqual({
      consume: {
        only: [],
        map: {},
        output: DEFAULT_OUTPUT_DIR,
      },
      publish: {
        source: DEFAULT_SKILLS_DIR,
        exports: [],
        refs: [
          {
            source: "readmes",
            destination: "skills/core/references/readmes",
          },
        ],
        disabled: false,
      },
    });
  });

  it("reads config from the default policy file before package.json", async () => {
    const cwd = await createTempProject();

    await writeJson(path.join(cwd, "package.json"), {
      npmSkills: {
        consume: {
          output: ".agents/skills/from-package",
        },
      },
    });
    await writeJson(path.join(cwd, DEFAULT_POLICY_FILE), {
      consume: {
        output: ".agents/skills/from-policy",
      },
    });

    await expect(readProjectNpmSkillsConfig(cwd)).resolves.toEqual({
      consume: {
        only: [],
        map: {},
        output: ".agents/skills/from-policy",
      },
      publish: {
        source: DEFAULT_SKILLS_DIR,
        exports: [],
        refs: [],
        disabled: false,
      },
    });
  });

  it("reads config from an explicit policy path without falling back", async () => {
    const cwd = await createTempProject();

    await writeJson(path.join(cwd, "package.json"), {
      npmSkills: {
        consume: {
          output: ".agents/skills/from-package",
        },
      },
    });
    await writeJson(path.join(cwd, DEFAULT_POLICY_FILE), {
      consume: {
        output: ".agents/skills/from-default-policy",
      },
    });
    await writeJson(path.join(cwd, "config/custom-policy.json"), {
      consume: {
        output: ".agents/skills/from-explicit-policy",
      },
    });

    await expect(
      readProjectNpmSkillsConfig(cwd, "config/custom-policy.json"),
    ).resolves.toEqual({
      consume: {
        only: [],
        map: {},
        output: ".agents/skills/from-explicit-policy",
      },
      publish: {
        source: DEFAULT_SKILLS_DIR,
        exports: [],
        refs: [],
        disabled: false,
      },
    });
  });

  it("falls back to package.json when no policy file exists", async () => {
    const cwd = await createTempProject();

    await writeJson(path.join(cwd, "package.json"), {
      npmSkills: {
        consume: {
          output: ".agents/skills/from-package",
        },
      },
    });

    await expect(readProjectNpmSkillsConfig(cwd)).resolves.toEqual({
      consume: {
        only: [],
        map: {},
        output: ".agents/skills/from-package",
      },
      publish: {
        source: DEFAULT_SKILLS_DIR,
        exports: [],
        refs: [],
        disabled: false,
      },
    });
  });

  it("reads installed package.json files", async () => {
    const cwd = await createTempProject();
    const packageJsonPath = path.join(
      cwd,
      "node_modules",
      "pkg",
      "package.json",
    );

    await writeJson(packageJsonPath, {
      name: "pkg",
      version: "1.2.3",
      npmSkills: {
        publish: {
          source: "my-skills",
        },
      },
    });

    await expect(readInstalledPackageJson(packageJsonPath)).resolves.toEqual({
      name: "pkg",
      version: "1.2.3",
      npmSkills: {
        publish: {
          source: "my-skills",
        },
      },
    });
  });

  it("fails when an explicit policy path is missing", async () => {
    const cwd = await createTempProject();

    await writeJson(path.join(cwd, "package.json"), {
      name: "fixture",
    });

    await expect(
      readProjectNpmSkillsConfig(cwd, "config/missing-policy.json"),
    ).rejects.toThrow(/ENOENT/);
  });

  it("fails when a discovered policy file contains invalid JSON", async () => {
    const cwd = await createTempProject();

    await writeJson(path.join(cwd, "package.json"), {
      name: "fixture",
    });
    await fs.writeFile(path.join(cwd, DEFAULT_POLICY_FILE), "{bad json");

    await expect(readProjectNpmSkillsConfig(cwd)).rejects.toThrow(
      /Unexpected token|Expected property name/i,
    );
  });

  it("rethrows unexpected access errors while checking the default policy path", async () => {
    const cwd = await createTempProject();
    const accessSpy = jest
      .spyOn(fs, "access")
      .mockImplementation(async (targetPath) => {
        if (String(targetPath) === path.join(cwd, DEFAULT_POLICY_FILE)) {
          throw Object.assign(new Error("permission denied"), {
            code: "EPERM",
          });
        }

        return undefined;
      });

    await writeJson(path.join(cwd, "package.json"), {
      name: "fixture",
    });

    await expect(readProjectNpmSkillsConfig(cwd)).rejects.toThrow(
      "permission denied",
    );
    expect(accessSpy).toHaveBeenCalled();
  });
});
