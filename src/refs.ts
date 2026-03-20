import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readProjectNpmSkillsConfig } from "./package-config";
import { Logger, SyncRefsOptions, SyncRefsReport } from "./types";

const DEFAULT_LOGGER: Logger = {
  info: console.log,
  warn: console.warn,
};

function staysWithinRoot(rootDir: string, targetPath: string): boolean {
  const relativePath = path.relative(rootDir, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function resolveProjectPath(
  cwd: string,
  configuredPath: string,
  label: string,
): string {
  const resolvedPath = path.resolve(cwd, configuredPath);
  if (!staysWithinRoot(cwd, resolvedPath)) {
    throw new Error(
      `${label} must stay within the project directory: ${configuredPath}`,
    );
  }

  return resolvedPath;
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

async function detectLinkType(sourcePath: string): Promise<"dir" | "file"> {
  const stats = await fs.stat(sourcePath);
  return stats.isDirectory() ? "dir" : "file";
}

function resolveSymlinkTarget(
  sourcePath: string,
  destinationPath: string,
): string {
  if (process.platform === "win32") {
    // Windows link targets should stay absolute for both files and directories.
    return sourcePath;
  }

  return path.relative(path.dirname(destinationPath), sourcePath);
}

function resolveSymlinkType(
  linkType: "dir" | "file",
): "dir" | "file" | "junction" {
  if (process.platform === "win32" && linkType === "dir") {
    return "junction";
  }

  return linkType;
}

async function materializeRef(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  await fs.rm(destinationPath, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.cp(sourcePath, destinationPath, { recursive: true });
}

async function restoreRef(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  await fs.rm(destinationPath, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  const linkType = await detectLinkType(sourcePath);
  const symlinkTarget = resolveSymlinkTarget(sourcePath, destinationPath);
  const symlinkType = resolveSymlinkType(linkType);
  await fs.symlink(symlinkTarget, destinationPath, symlinkType);
}

export async function syncSkillPublishRefs(
  options: SyncRefsOptions,
): Promise<SyncRefsReport> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const logger = options.logger ?? DEFAULT_LOGGER;
  const config = await readProjectNpmSkillsConfig(cwd, options.policyPath);
  const synced: SyncRefsReport["synced"] = [];

  for (const ref of config.publish.refs) {
    const sourcePath = resolveProjectPath(cwd, ref.source, "Ref source");
    const destinationPath = resolveProjectPath(
      cwd,
      ref.destination,
      "Ref destination",
    );

    if (sourcePath === destinationPath) {
      throw new Error(`Ref source and destination must differ: ${ref.source}`);
    }

    if (!(await pathExists(sourcePath))) {
      throw new Error(`Ref source does not exist: ${ref.source}`);
    }

    if (options.mode === "materialize") {
      await materializeRef(sourcePath, destinationPath);
    } else {
      await restoreRef(sourcePath, destinationPath);
    }

    logger.info(
      `${options.mode === "materialize" ? "Materialized" : "Restored"} ${ref.destination}`,
    );
    synced.push({ sourcePath, destinationPath });
  }

  return {
    mode: options.mode,
    synced,
  };
}
