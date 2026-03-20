import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  DependencySection,
  InstalledPackageJson,
  NpmSkillsConsumeConfig,
  NpmSkillsConfig,
  NpmSkillsPublishConfig,
  NpmSkillsPublishRefConfig,
  ProjectPackageJson,
  ResolvedNpmSkillsConsumeConfig,
  ResolvedNpmSkillsConfig,
  ResolvedNpmSkillsPublishConfig,
  ResolvedNpmSkillsPublishRefConfig,
} from "./types";

export const DEFAULT_SKILLS_DIR = "skills";
export const DEFAULT_OUTPUT_DIR = ".agents/skills";

function isNpmSkillsConfig(value: unknown): value is NpmSkillsConfig {
  return Boolean(value) && typeof value === "object";
}

function isNpmSkillsConsumeConfig(
  value: unknown,
): value is NpmSkillsConsumeConfig {
  return Boolean(value) && typeof value === "object";
}

function resolveStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === "string");
}

function resolveStringMap(
  value: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!value) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function resolveConsumeConfig(
  config: NpmSkillsConfig | NpmSkillsConsumeConfig | undefined,
): ResolvedNpmSkillsConsumeConfig {
  const nestedConsume: NpmSkillsConsumeConfig =
    config && "consume" in config
      ? isNpmSkillsConsumeConfig(config.consume)
        ? config.consume
        : {}
      : isNpmSkillsConsumeConfig(config)
        ? config
        : {};

  return {
    only: resolveStringArray(nestedConsume.only) ?? [],
    map: {
      ...resolveStringMap(nestedConsume.map),
    },
    output:
      typeof nestedConsume.output === "string"
        ? nestedConsume.output
        : DEFAULT_OUTPUT_DIR,
  };
}

function resolveConsumeOnly(
  config: NpmSkillsConfig | undefined,
): string[] | undefined {
  const nestedConsume = isNpmSkillsConfig(config?.consume)
    ? config.consume
    : {};

  return resolveStringArray(nestedConsume.only) ?? undefined;
}

function resolvePublishExports(
  config: NpmSkillsPublishConfig | undefined,
): false | string[] | undefined {
  if (config?.export === false) return false;

  return resolveStringArray(config?.export) ?? undefined;
}

function resolvePublishSource(
  config: NpmSkillsPublishConfig | undefined,
): string | undefined {
  if (typeof config?.source === "string") return config.source;
  return undefined;
}

function resolvePublishRefs(
  config: NpmSkillsPublishConfig | undefined,
): ResolvedNpmSkillsPublishRefConfig[] {
  if (!Array.isArray(config?.refs)) return [];

  return config.refs.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];

    const ref = entry as NpmSkillsPublishRefConfig;
    if (
      typeof ref.source !== "string" ||
      typeof ref.destination !== "string" ||
      ref.source.length === 0 ||
      ref.destination.length === 0
    ) {
      return [];
    }

    return [
      {
        source: ref.source,
        destination: ref.destination,
      },
    ];
  });
}

function resolvePublishConfig(
  packageJson: ProjectPackageJson | InstalledPackageJson,
): ResolvedNpmSkillsPublishConfig {
  const value = packageJson.npmSkills;
  const config = isNpmSkillsConfig(value) ? value : undefined;
  const publish =
    config?.publish === false
      ? false
      : isNpmSkillsConfig(config?.publish)
        ? config.publish
        : undefined;
  const publishConfig = publish === false ? undefined : publish;
  const exportedNames = resolvePublishExports(publishConfig);
  const disabled =
    value === false || publish === false || exportedNames === false;

  if (disabled) {
    return {
      source: resolvePublishSource(publishConfig) ?? DEFAULT_SKILLS_DIR,
      exports: [],
      refs: [],
      disabled: true,
    };
  }

  return {
    source: resolvePublishSource(publishConfig) ?? DEFAULT_SKILLS_DIR,
    exports: exportedNames ?? [],
    refs: resolvePublishRefs(publishConfig),
    disabled: false,
  };
}

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
  const value = packageJson.npmSkills;
  const config = isNpmSkillsConfig(value) ? value : undefined;
  const consume = resolveConsumeConfig(config);
  const only = resolveConsumeOnly(config);

  return {
    consume: {
      only: only ?? [],
      map: consume.map,
      output: consume.output,
    },
    publish: resolvePublishConfig(packageJson),
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
  config:
    | NpmSkillsConsumeConfig
    | NpmSkillsConfig
    | ResolvedNpmSkillsConfig
    | ResolvedNpmSkillsConsumeConfig,
): string {
  if ("consume" in config) {
    return config.consume?.map?.[packageName] ?? DEFAULT_SKILLS_DIR;
  }

  if ("only" in config || "map" in config || "output" in config) {
    return config.map?.[packageName] ?? DEFAULT_SKILLS_DIR;
  }

  const consume = resolveConsumeConfig(config);
  return consume.map[packageName] ?? DEFAULT_SKILLS_DIR;
}

export function resolvePackageExportConfig(
  packageJson: InstalledPackageJson,
): false | ResolvedNpmSkillsPublishConfig {
  const publish = resolvePublishConfig(packageJson);
  return publish.disabled ? false : publish;
}
