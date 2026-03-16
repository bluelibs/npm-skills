import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DEFAULT_OUTPUT_DIR } from "./package-config";
import { sanitizePathSegment } from "./patterns";
import { CreateSkillTemplateOptions, CreateSkillTemplateReport } from "./types";

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

function toSkillTitle(skillDirName: string): string {
  return skillDirName
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildSkillTemplate(skillDirName: string): string {
  const title = toSkillTitle(skillDirName);

  return `---
name: ${skillDirName}
description: Describe what this skill does and when it should be used.
license: MIT. LICENSE.txt has complete terms
---

## Purpose
Describe the goal of ${title} in one or two short paragraphs.

## When To Use
- Explain the situations where this skill should be selected.
- Mention any constraints, assumptions, or anti-patterns.

## Inputs
- List the files, folders, commands, or context this skill needs.

## Steps
1. Replace this template with the workflow for this skill.
2. Keep instructions concrete, short, and easy to follow.
3. Move long supporting material into \`references/\` instead of overloading this file.

## References
- Put deeper examples, checklists, or domain notes in \`references/\`.

## Output
Describe the expected result.

## Tips
- Prefer precise, actionable instructions over general advice.
- Keep this file focused on routing and execution, then use \`references/\` for depth.
`;
}

function buildReferencesTemplate(skillDirName: string): string {
  return `# References For ${skillDirName}

Use this folder for material that supports the skill without bloating \`SKILL.md\`.

Helpful things to put here:
- Checklists
- Example prompts
- Sample inputs and outputs
- Domain notes
- Troubleshooting steps
`;
}

function buildLicenseTemplate(currentYear: number): string {
  return `MIT License

Copyright (c) ${currentYear}-present

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

export async function createSkillTemplate(
  options: CreateSkillTemplateOptions,
): Promise<CreateSkillTemplateReport> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const baseDir = path.resolve(cwd, options.folder ?? DEFAULT_OUTPUT_DIR);
  const skillDirName = sanitizePathSegment(options.skillName);
  const skillDir = path.join(baseDir, skillDirName);
  const skillFile = path.join(skillDir, "SKILL.md");
  const licenseFile = path.join(skillDir, "LICENSE.txt");
  const referencesDir = path.join(skillDir, "references");
  const referencesFile = path.join(referencesDir, "README.md");
  const currentYear = new Date().getFullYear();

  await fs.mkdir(baseDir, { recursive: true });

  if (await pathExists(skillDir)) {
    throw new Error(`Skill already exists at ${skillDir}`);
  }

  await fs.mkdir(skillDir);
  await fs.mkdir(referencesDir);
  await fs.writeFile(skillFile, buildSkillTemplate(skillDirName));
  await fs.writeFile(licenseFile, buildLicenseTemplate(currentYear));
  await fs.writeFile(referencesFile, buildReferencesTemplate(skillDirName));

  return {
    skillName: skillDirName,
    skillDir,
    skillFile,
  };
}
