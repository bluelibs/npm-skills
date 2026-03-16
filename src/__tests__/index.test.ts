import * as cli from "../cli";
import * as extract from "../extract";
import * as index from "../index";
import * as packageConfig from "../package-config";
import * as patterns from "../patterns";

describe("index exports", () => {
  it("re-exports the public api", () => {
    expect(index.extractSkills).toBe(extract.extractSkills);
    expect(index.parseCliArgs).toBe(cli.parseCliArgs);
    expect(index.runCli).toBe(cli.runCli);
    expect(index.DEFAULT_SKILLS_DIR).toBe(packageConfig.DEFAULT_SKILLS_DIR);
    expect(index.getDependencyPackageNames).toBe(
      packageConfig.getDependencyPackageNames,
    );
    expect(index.getDependencySections).toBe(
      packageConfig.getDependencySections,
    );
    expect(index.getPackageSkillSourceDir).toBe(
      packageConfig.getPackageSkillSourceDir,
    );
    expect(index.readInstalledPackageJson).toBe(
      packageConfig.readInstalledPackageJson,
    );
    expect(index.readProjectPackageJson).toBe(
      packageConfig.readProjectPackageJson,
    );
    expect(index.resolvePackageExportConfig).toBe(
      packageConfig.resolvePackageExportConfig,
    );
    expect(index.resolveNpmSkillsConfig).toBe(
      packageConfig.resolveNpmSkillsConfig,
    );
    expect(index.matchesAnyPattern).toBe(patterns.matchesAnyPattern);
    expect(index.matchesPattern).toBe(patterns.matchesPattern);
    expect(index.sanitizeName).toBe(patterns.sanitizeName);
    expect(index.splitCommaSeparatedValues).toBe(
      patterns.splitCommaSeparatedValues,
    );
    expect(index.wildcardToRegExp).toBe(patterns.wildcardToRegExp);
  });
});
