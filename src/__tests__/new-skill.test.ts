import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createSkillTemplate } from "../new-skill";

async function createTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "npm-skills-new-test-"));
}

function endsWithPath(targetPath: unknown, ...segments: string[]): boolean {
  return path.normalize(String(targetPath)).endsWith(path.join(...segments));
}

describe("createSkillTemplate", () => {
  it("uses process.cwd when cwd is omitted", async () => {
    const cwd = await createTempProject();
    const previousCwd = process.cwd();

    try {
      process.chdir(cwd);
      const report = await createSkillTemplate({
        skillName: "from-cwd",
      });

      expect(await fs.realpath(report.skillDir)).toBe(
        await fs.realpath(path.join(cwd, ".agents/skills/from-cwd")),
      );
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("creates a default skill template in .agents/skills", async () => {
    const cwd = await createTempProject();
    const currentYear = new Date().getFullYear();

    const report = await createSkillTemplate({
      cwd,
      skillName: "release-notes",
    });

    expect(report.skillName).toBe("release-notes");
    expect(report.skillDir).toBe(
      path.join(cwd, ".agents/skills/release-notes"),
    );
    await expect(fs.readFile(report.skillFile, "utf8")).resolves.toContain(
      "name: release-notes",
    );
    await expect(fs.readFile(report.skillFile, "utf8")).resolves.toContain(
      "description: Describe what this skill does and when it should be used.",
    );
    await expect(
      fs.readFile(path.join(report.skillDir, "LICENSE.txt"), "utf8"),
    ).resolves.toContain(`Copyright (c) ${currentYear}-present`);
    await expect(
      fs.readFile(path.join(report.skillDir, "references/README.md"), "utf8"),
    ).resolves.toContain("# References For release-notes");
  });

  it("creates parent folders nicely and sanitizes the skill directory name", async () => {
    const cwd = await createTempProject();

    const report = await createSkillTemplate({
      cwd,
      skillName: "Release Notes!",
      folder: "templates/skills",
    });

    expect(report.skillName).toBe("release-notes");
    expect(report.skillDir).toBe(
      path.join(cwd, "templates/skills/release-notes"),
    );
    await expect(fs.readFile(report.skillFile, "utf8")).resolves.toContain(
      "## When To Use",
    );
  });

  it("fails fast when the skill directory already exists", async () => {
    const cwd = await createTempProject();
    await fs.mkdir(path.join(cwd, ".agents/skills/existing-skill"), {
      recursive: true,
    });

    await expect(
      createSkillTemplate({
        cwd,
        skillName: "existing-skill",
      }),
    ).rejects.toThrow(
      `Skill already exists at ${path.join(cwd, ".agents/skills/existing-skill")}`,
    );
  });

  it("rethrows unexpected filesystem access errors", async () => {
    const cwd = await createTempProject();
    const originalAccess = fs.access;
    const permissionError = Object.assign(new Error("denied"), {
      code: "EACCES",
    });

    jest.spyOn(fs, "access").mockImplementation(async (targetPath, mode) => {
      if (endsWithPath(targetPath, ".agents", "skills", "broken-skill")) {
        throw permissionError;
      }

      return originalAccess(targetPath, mode);
    });

    await expect(
      createSkillTemplate({
        cwd,
        skillName: "broken-skill",
      }),
    ).rejects.toBe(permissionError);
  });
});
