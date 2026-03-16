import {
  DEFAULT_OUTPUT_DIR,
  DEFAULT_SKILLS_DIR,
  getDependencyPackageNames,
  getDependencySections,
  getPackageSkillSourceDir,
  resolvePackageExportConfig,
  resolveNpmSkillsConfig,
} from "../package-config";

describe("package-config", () => {
  it("exposes separate defaults for package sources and extraction output", () => {
    expect(DEFAULT_SKILLS_DIR).toBe("skills");
    expect(DEFAULT_OUTPUT_DIR).toBe(".agents/skills");
  });

  it("resolves consume and publish config from npmSkills", () => {
    const config = resolveNpmSkillsConfig({
      npmSkills: {
        consume: {
          only: ["consume-only"],
          map: {
            mappedConsume: ".consume/mapped-skills",
          },
        },
        publish: {
          source: ".agents/skills",
          export: ["public", "react"],
        },
      },
    });

    expect(config).toEqual({
      consume: {
        only: ["consume-only"],
        map: {
          mappedConsume: ".consume/mapped-skills",
        },
      },
      publish: {
        source: ".agents/skills",
        exports: ["public", "react"],
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
      },
      publish: {
        source: ".modern/publish",
        exports: ["modern"],
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
        consume: {
          map: {
            "@bluelibs/runner": ".consume/skills",
          },
        },
      }),
    ).toBe(".consume/skills");
    expect(
      getPackageSkillSourceDir("@bluelibs/runner", {
        consume: {},
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
      disabled: false,
    });
    expect(resolvePackageExportConfig({ npmSkills: true as never })).toEqual({
      source: DEFAULT_SKILLS_DIR,
      exports: [],
      disabled: false,
    });
    expect(resolvePackageExportConfig({ npmSkills: {} })).toEqual({
      source: DEFAULT_SKILLS_DIR,
      exports: [],
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
});
