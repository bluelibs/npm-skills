import {
  DEFAULT_SKILLS_DIR,
  getDependencyPackageNames,
  getDependencySections,
  getPackageSkillSourceDir,
  resolvePackageExportConfig,
  resolveNpmSkillsConfig,
} from "../package-config";

describe("package-config", () => {
  it("merges modern and legacy npm skills config", () => {
    const config = resolveNpmSkillsConfig({
      "npm-skills": {
        only: ["legacy-only"],
        custom: {
          legacy: ".legacy/skills",
        },
      },
      npmSkills: {
        only: ["modern-only"],
        custom: {
          modern: ".modern/skills",
        },
      },
    });

    expect(config).toEqual({
      only: ["modern-only"],
      custom: {
        legacy: ".legacy/skills",
        modern: ".modern/skills",
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

  it("resolves custom skill directories", () => {
    expect(
      getPackageSkillSourceDir("@bluelibs/runner", {
        custom: {
          "@bluelibs/runner": ".agents/skills",
        },
      }),
    ).toBe(".agents/skills");
    expect(getPackageSkillSourceDir("left-pad", {})).toBe(DEFAULT_SKILLS_DIR);
  });

  it("resolves package-side export config and opt-out", () => {
    expect(resolvePackageExportConfig({ npmSkills: false })).toBe(false);
    expect(
      resolvePackageExportConfig({
        npmSkills: {
          export: ["runner", "architecture"],
        },
      }),
    ).toEqual(["runner", "architecture"]);
    expect(
      resolvePackageExportConfig({
        "npm-skills": {
          export: ["legacy"],
        },
      }),
    ).toEqual(["legacy"]);
    expect(resolvePackageExportConfig({ npmSkills: true as never })).toEqual(
      [],
    );
    expect(resolvePackageExportConfig({ npmSkills: {} })).toEqual([]);
    expect(
      resolvePackageExportConfig({
        npmSkills: {
          export: ["ok", 1 as never],
        },
      }),
    ).toEqual(["ok"]);
  });
});
