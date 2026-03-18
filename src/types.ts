export type DependencySection =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";

export interface NpmSkillsConsumeConfig {
  only?: string[];
  map?: Record<string, string>;
  output?: string;
}

export interface NpmSkillsPublishConfig {
  source?: string;
  export?: false | string[];
}

export interface NpmSkillsConfig {
  consume?: NpmSkillsConsumeConfig;
  publish?: false | NpmSkillsPublishConfig;
}

export interface ResolvedNpmSkillsConsumeConfig {
  only: string[];
  map: Record<string, string>;
  output: string;
}

export interface ResolvedNpmSkillsPublishConfig {
  source: string;
  exports: string[];
  disabled: boolean;
}

export interface ResolvedNpmSkillsConfig {
  consume: ResolvedNpmSkillsConsumeConfig;
  publish: ResolvedNpmSkillsPublishConfig;
}

export interface PackageExportConfig extends NpmSkillsPublishConfig {}

export type PackageNpmSkillsConfig = false | NpmSkillsConfig;

export interface ProjectPackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  npmSkills?: false | NpmSkillsConfig;
}

export interface InstalledPackageJson {
  name?: string;
  version?: string;
  npmSkills?: PackageNpmSkillsConfig;
}

export interface ExtractOptions {
  cwd?: string;
  outputDir?: string;
  only?: string[];
  packageNames?: string[];
  skipProduction?: boolean;
  includeDevDependencies?: boolean;
  override?: boolean;
  verbose?: boolean;
  logger?: Logger;
  prompt?: OverwritePrompt;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export interface OverwritePrompt {
  confirmOverwrite(destinationDir: string): Promise<boolean>;
}

export interface ExtractedSkill {
  packageName: string;
  sourceDir: string;
  destinationDir: string;
  destinationName: string;
}

export interface SkippedSkill {
  packageName: string;
  sourceDir: string;
  destinationDir: string;
  reason:
    | "declined"
    | "missing-package"
    | "non-interactive"
    | "missing-source"
    | "package-opt-out";
}

export interface ExtractReport {
  outputDir: string;
  scannedPackages: string[];
  extracted: ExtractedSkill[];
  skipped: SkippedSkill[];
  deletedSkills: number;
  skippedEnvironment?: {
    reason: "production";
    received: string;
  };
}

export interface CreateSkillTemplateOptions {
  cwd?: string;
  skillName: string;
  folder?: string;
}

export interface CreateSkillTemplateReport {
  skillName: string;
  skillDir: string;
  skillFile: string;
}

export interface CliDependencies {
  stdout: Pick<typeof console, "log" | "error">;
  logger: Logger;
  prompt?: OverwritePrompt;
  isInteractive: boolean;
}
