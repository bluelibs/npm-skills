import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  DependencySection,
  InstalledPackageJson,
  NpmSkillsConfig,
  PackageExportConfig,
  ProjectPackageJson,
  ResolvedNpmSkillsConfig,
} from "./types";

export const DEFAULT_SKILLS_DIR = "skills";

export async function readProjectPackageJson(
  cwd: string,
): Promise<ProjectPackageJson> {
  const packageJsonPath = path.join(cwd, "package.json");
  const content = await fs.readFile(packageJsonPath, "utf8");
  return JSON.parse(content) as ProjectPackageJson;
}

export async function readInstalledPackageJson(
  packageJsonPath: string,
): Promise<InstalledPackageJson> {
  const content = await fs.readFile(packageJsonPath, "utf8");
  return JSON.parse(content) as InstalledPackageJson;
}

export function resolveNpmSkillsConfig(
  packageJson: ProjectPackageJson,
): ResolvedNpmSkillsConfig {
  const legacy = packageJson["npm-skills"] ?? {};
  const modern = packageJson.npmSkills ?? {};

  return {
    only: modern.only ?? legacy.only ?? [],
    custom: {
      ...(legacy.custom ?? {}),
      ...(modern.custom ?? {}),
    },
  };
}

export function getDependencySections(
  includeDevDependencies: boolean,
): DependencySection[] {
  const sections: DependencySection[] = [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ];

  if (includeDevDependencies) sections.push("devDependencies");
  return sections;
}

export function getDependencyPackageNames(
  packageJson: ProjectPackageJson,
  includeDevDependencies: boolean,
): string[] {
  const names = new Set<string>();

  for (const section of getDependencySections(includeDevDependencies)) {
    for (const name of Object.keys(packageJson[section] ?? {})) {
      names.add(name);
    }
  }

  return Array.from(names).sort();
}

export function getPackageSkillSourceDir(
  packageName: string,
  config: NpmSkillsConfig,
): string {
  return config.custom?.[packageName] ?? DEFAULT_SKILLS_DIR;
}

function isPackageExportConfig(value: unknown): value is PackageExportConfig {
  return Boolean(value) && typeof value === "object";
}

export function resolvePackageExportConfig(
  packageJson: InstalledPackageJson,
): false | string[] {
  const config = packageJson.npmSkills ?? packageJson["npm-skills"];

  if (config === false) return false;
  if (!isPackageExportConfig(config)) return [];

  return Array.isArray(config.export)
    ? config.export.filter((entry) => typeof entry === "string")
    : [];
}
