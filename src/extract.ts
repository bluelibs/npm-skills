import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createRequire } from "node:module";
import {
  DEFAULT_SKILLS_DIR,
  getDependencyPackageNames,
  readInstalledPackageJson,
  readProjectPackageJson,
  resolvePackageExportConfig,
  resolveNpmSkillsConfig,
} from "./package-config";
import {
  matchesAnyPattern,
  sanitizeName,
  sanitizePathSegments,
} from "./patterns";
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

const EXTRACT_MANIFEST_FILE = ".npm-skills-manifest.json";

interface ExtractManifest {
  packages: Record<string, string[]>;
}

function readEnvironmentVariable(name: string): string | undefined {
  const processValue = Reflect.get(process.env, name);
  if (typeof processValue === "string") return processValue;

  const denoEnv = Reflect.get(Reflect.get(globalThis, "Deno") ?? {}, "env");
  const get = Reflect.get(denoEnv ?? {}, "get");
  if (typeof get !== "function") return undefined;

  const value = Reflect.apply(get, denoEnv, [name]);
  return typeof value === "string" ? value : undefined;
}

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

async function resolveInstalledPackageJsonPath(
  resolvePath: (specifier: string) => string,
  cwd: string,
  packageName: string,
): Promise<string | undefined> {
  const packageNameSegments = packageName.split("/");

  try {
    const packageJsonPath = resolvePath(`${packageName}/package.json`);
    return (await pathExists(packageJsonPath)) ? packageJsonPath : undefined;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (
      code === "MODULE_NOT_FOUND" ||
      code === "ERR_MODULE_NOT_FOUND" ||
      code === "ERR_PACKAGE_PATH_NOT_EXPORTED"
    ) {
      if (code === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
        try {
          const packageEntryPath = resolvePath(packageName);
          const startDir = (await fs.stat(packageEntryPath)).isDirectory()
            ? packageEntryPath
            : path.dirname(packageEntryPath);

          let currentDir = await fs.realpath(startDir);
          while (true) {
            const packageJsonPath = path.join(currentDir, "package.json");
            if (await pathExists(packageJsonPath)) return packageJsonPath;

            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) break;
            currentDir = parentDir;
          }
        } catch (fallbackError) {
          const fallbackCode = (fallbackError as NodeJS.ErrnoException).code;
          if (
            fallbackCode === "MODULE_NOT_FOUND" ||
            fallbackCode === "ERR_MODULE_NOT_FOUND"
          ) {
            // Fall through to explicit node_modules candidates below.
          } else {
            throw fallbackError;
          }
        }

        const fallbackCandidates = [
          path.join(
            cwd,
            "node_modules",
            ...packageNameSegments,
            "package.json",
          ),
          path.join(
            await fs.realpath(cwd),
            "node_modules",
            ...packageNameSegments,
            "package.json",
          ),
        ];

        for (const candidatePath of fallbackCandidates) {
          if (await pathExists(candidatePath)) return candidatePath;
        }
      }
      return undefined;
    }
    throw error;
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
  const skillSegment = sanitizePathSegments(
    relativeSkillDir || DEFAULT_SKILLS_DIR,
  );
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
  return (specifier: string) => requireFromProject.resolve(specifier);
}

function shouldPruneStaleSkills(options: ExtractOptions): boolean {
  return (
    options.packageNames === undefined &&
    options.only === undefined &&
    (options.includeDevDependencies ?? true)
  );
}

function createEmptyManifest(): ExtractManifest {
  return { packages: {} };
}

async function readExtractManifest(
  outputDir: string,
): Promise<ExtractManifest> {
  try {
    const content = await fs.readFile(
      path.join(outputDir, EXTRACT_MANIFEST_FILE),
      "utf8",
    );
    return JSON.parse(content) as ExtractManifest;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return createEmptyManifest();
    throw error;
  }
}

async function writeExtractManifest(
  outputDir: string,
  manifest: ExtractManifest,
): Promise<void> {
  await fs.writeFile(
    path.join(outputDir, EXTRACT_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function rememberManagedDestination(
  manifest: ExtractManifest,
  packageName: string,
  destinationName: string,
): void {
  manifest.packages[packageName] = Array.from(
    new Set([...manifest.packages[packageName], destinationName]),
  ).sort();
}

function flattenManagedDestinations(manifest: ExtractManifest): string[] {
  return Object.values(manifest.packages).flat().sort();
}

export async function extractSkills(
  options: ExtractOptions = {},
): Promise<ExtractReport> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const requiredEnvironment = options.env?.trim();
  const includeDevDependencies = options.includeDevDependencies ?? true;
  const override = options.override ?? false;
  const verbose = options.verbose ?? false;
  const logger = options.logger ?? DEFAULT_LOGGER;
  const pruneStaleSkills = shouldPruneStaleSkills(options);

  const projectPackageJson = await readProjectPackageJson(cwd);
  const projectConfig = resolveNpmSkillsConfig(projectPackageJson);
  const outputDir = path.resolve(
    cwd,
    options.outputDir ?? projectConfig.consume.output,
  );
  const packageFilters = getPackageFilters(options, projectConfig.consume.only);
  const scannedPackages = getDependencyPackageNames(
    projectPackageJson,
    includeDevDependencies,
  ).filter((packageName) => matchesAnyPattern(packageName, packageFilters));

  const resolvePath = createPackageResolver(cwd);
  const report: ExtractReport = {
    outputDir,
    scannedPackages,
    extracted: [],
    skipped: [],
    deletedSkills: 0,
  };

  if (requiredEnvironment) {
    const currentEnvironment = readEnvironmentVariable("NODE_ENV");
    if (currentEnvironment !== requiredEnvironment) {
      logger.info(
        `Skipped extraction because NODE_ENV is ${currentEnvironment ?? "undefined"}, expected ${requiredEnvironment}.`,
      );
      return {
        ...report,
        scannedPackages: [],
        skippedEnvironment: {
          expected: requiredEnvironment,
          received: currentEnvironment,
        },
      };
    }
  }

  const previousManifest = pruneStaleSkills
    ? await readExtractManifest(outputDir)
    : createEmptyManifest();
  const nextManifest = createEmptyManifest();
  const unresolvedPackages = new Set<string>();

  await fs.mkdir(outputDir, { recursive: true });

  for (const packageName of scannedPackages) {
    const packageJsonPath = await resolveInstalledPackageJsonPath(
      resolvePath,
      cwd,
      packageName,
    );
    if (!packageJsonPath) {
      unresolvedPackages.add(packageName);
      report.skipped.push({
        packageName,
        sourceDir: "",
        destinationDir: outputDir,
        reason: "missing-package",
      });
      logger.warn(
        `Skipped ${packageName} because it could not be resolved from node_modules.`,
      );
      continue;
    }

    nextManifest.packages[packageName] = [];

    const installedPackageJson =
      await readInstalledPackageJson(packageJsonPath);
    const packageExports = resolvePackageExportConfig(installedPackageJson);
    const packageRoot = path.dirname(packageJsonPath);

    if (packageExports === false) {
      const sourceRoot = path.join(
        packageRoot,
        projectConfig.consume.map[packageName] ?? DEFAULT_SKILLS_DIR,
      );
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

    const sourceRoot = path.join(
      packageRoot,
      projectConfig.consume.map[packageName] ?? packageExports.source,
    );

    const skillDirectories = await findSkillDirectories(sourceRoot);

    if (skillDirectories.length === 0) {
      report.skipped.push({
        packageName,
        sourceDir: sourceRoot,
        destinationDir: outputDir,
        reason: "missing-source",
      });
      if (verbose) {
        logger.warn(`No skills found for ${packageName} at ${sourceRoot}`);
      }
      continue;
    }

    for (const skillDirectory of skillDirectories) {
      if (
        packageExports.exports.length > 0 &&
        !packageExports.exports.includes(
          getSkillExportName(sourceRoot, skillDirectory),
        )
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
        if (previousManifest.packages[packageName]?.includes(destinationName)) {
          rememberManagedDestination(
            nextManifest,
            packageName,
            destinationName,
          );
        }
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
        if (previousManifest.packages[packageName]?.includes(destinationName)) {
          rememberManagedDestination(
            nextManifest,
            packageName,
            destinationName,
          );
        }
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
      rememberManagedDestination(nextManifest, packageName, destinationName);

      report.extracted.push({
        packageName,
        sourceDir: skillDirectory,
        destinationDir,
        destinationName,
      });
      logger.info(`Extracted ${destinationName}`);
    }
  }

  if (pruneStaleSkills) {
    for (const packageName of unresolvedPackages) {
      const previousNames = previousManifest.packages[packageName];
      if (!previousNames) continue;

      nextManifest.packages[packageName] = [...previousNames];
    }

    const currentDestinations = new Set(
      flattenManagedDestinations(nextManifest),
    );
    const staleDestinations = flattenManagedDestinations(
      previousManifest,
    ).filter((destinationName) => !currentDestinations.has(destinationName));

    for (const destinationName of staleDestinations) {
      await fs.rm(path.join(outputDir, destinationName), {
        recursive: true,
        force: true,
      });
      report.deletedSkills += 1;
      logger.info(`Removed stale ${destinationName}`);
    }

    await writeExtractManifest(outputDir, nextManifest);
  }

  return report;
}
