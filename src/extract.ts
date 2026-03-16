import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createRequire } from "node:module";
import {
  DEFAULT_SKILLS_DIR,
  getDependencyPackageNames,
  getPackageSkillSourceDir,
  readInstalledPackageJson,
  readProjectPackageJson,
  resolvePackageExportConfig,
  resolveNpmSkillsConfig,
} from "./package-config";
import { matchesAnyPattern, sanitizeName } from "./patterns";
import {
  ExtractOptions,
  ExtractReport,
  Logger,
  OverwritePrompt,
} from "./types";

const DEFAULT_LOGGER: Logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
};

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findSkillDirectories(rootDir: string): Promise<string[]> {
  if (!(await pathExists(rootDir))) return [];

  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const hasSkillFile = entries.some(
    (entry) => entry.isFile() && entry.name === "SKILL.md",
  );
  if (hasSkillFile) return [rootDir];

  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name))
    .sort();

  const skillDirectories: string[] = [];
  for (const directory of directories) {
    skillDirectories.push(...(await findSkillDirectories(directory)));
  }

  return skillDirectories;
}

function getSkillExportName(
  sourceRoot: string,
  skillDirectory: string,
): string {
  const relativeSkillDir = path.relative(sourceRoot, skillDirectory);
  const [firstSegment] = relativeSkillDir.split(path.sep).filter(Boolean);
  return firstSegment ?? DEFAULT_SKILLS_DIR;
}

function buildDestinationName(
  packageName: string,
  relativeSkillDir: string,
): string {
  const packageSegment = sanitizeName(packageName);
  const skillSegment = sanitizeName(relativeSkillDir || DEFAULT_SKILLS_DIR);
  return `${packageSegment}-${skillSegment}`;
}

async function shouldOverwriteDestination(
  destinationDir: string,
  override: boolean,
  prompt: OverwritePrompt | undefined,
): Promise<"overwrite" | "skip" | "non-interactive"> {
  if (!(await pathExists(destinationDir))) return "overwrite";
  if (override) return "overwrite";
  if (!prompt) return "non-interactive";
  return (await prompt.confirmOverwrite(destinationDir)) ? "overwrite" : "skip";
}

function getPackageFilters(
  options: ExtractOptions,
  projectOnly: string[],
): string[] {
  const cliFilters = [...(options.packageNames ?? []), ...(options.only ?? [])];
  return cliFilters.length > 0 ? cliFilters : projectOnly;
}

function createPackageResolver(cwd: string): (packageName: string) => string {
  const packageJsonPath = path.join(cwd, "package.json");
  const requireFromProject = createRequire(packageJsonPath);
  return (packageName: string) =>
    requireFromProject.resolve(`${packageName}/package.json`);
}

export async function extractSkills(
  options: ExtractOptions = {},
): Promise<ExtractReport> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const outputDir = path.resolve(cwd, options.outputDir ?? DEFAULT_SKILLS_DIR);
  const includeDevDependencies = options.includeDevDependencies ?? true;
  const override = options.override ?? false;
  const logger = options.logger ?? DEFAULT_LOGGER;

  const projectPackageJson = await readProjectPackageJson(cwd);
  const projectConfig = resolveNpmSkillsConfig(projectPackageJson);
  const packageFilters = getPackageFilters(options, projectConfig.only);
  const scannedPackages = getDependencyPackageNames(
    projectPackageJson,
    includeDevDependencies,
  ).filter((packageName) => matchesAnyPattern(packageName, packageFilters));

  const resolvePackageJsonPath = createPackageResolver(cwd);
  const report: ExtractReport = {
    outputDir,
    scannedPackages,
    extracted: [],
    skipped: [],
  };

  await fs.mkdir(outputDir, { recursive: true });

  for (const packageName of scannedPackages) {
    const packageJsonPath = resolvePackageJsonPath(packageName);
    const installedPackageJson =
      await readInstalledPackageJson(packageJsonPath);
    const packageExports = resolvePackageExportConfig(installedPackageJson);
    const packageRoot = path.dirname(packageJsonPath);
    const sourceRoot = path.join(
      packageRoot,
      getPackageSkillSourceDir(packageName, projectConfig),
    );

    if (packageExports === false) {
      report.skipped.push({
        packageName,
        sourceDir: sourceRoot,
        destinationDir: outputDir,
        reason: "package-opt-out",
      });
      logger.warn(
        `Skipped ${packageName} because the package disabled skill export.`,
      );
      continue;
    }

    const skillDirectories = await findSkillDirectories(sourceRoot);

    if (skillDirectories.length === 0) {
      report.skipped.push({
        packageName,
        sourceDir: sourceRoot,
        destinationDir: outputDir,
        reason: "missing-source",
      });
      logger.warn(`No skills found for ${packageName} at ${sourceRoot}`);
      continue;
    }

    for (const skillDirectory of skillDirectories) {
      if (
        packageExports.length > 0 &&
        !packageExports.includes(getSkillExportName(sourceRoot, skillDirectory))
      ) {
        continue;
      }

      const relativeSkillDir = path.relative(sourceRoot, skillDirectory);
      const destinationName = buildDestinationName(
        packageName,
        relativeSkillDir,
      );
      const destinationDir = path.join(outputDir, destinationName);
      const overwriteDecision = await shouldOverwriteDestination(
        destinationDir,
        override,
        options.prompt,
      );

      if (overwriteDecision === "skip") {
        report.skipped.push({
          packageName,
          sourceDir: skillDirectory,
          destinationDir,
          reason: "declined",
        });
        logger.warn(
          `Skipped ${destinationName} because overwrite was declined.`,
        );
        continue;
      }

      if (overwriteDecision === "non-interactive") {
        report.skipped.push({
          packageName,
          sourceDir: skillDirectory,
          destinationDir,
          reason: "non-interactive",
        });
        logger.warn(
          `Skipped ${destinationName} because it already exists. Re-run with --override in non-interactive mode.`,
        );
        continue;
      }

      await fs.rm(destinationDir, { recursive: true, force: true });
      await fs.cp(skillDirectory, destinationDir, {
        recursive: true,
        force: true,
      });

      report.extracted.push({
        packageName,
        sourceDir: skillDirectory,
        destinationDir,
        destinationName,
      });
      logger.info(`Extracted ${destinationName}`);
    }
  }

  return report;
}
