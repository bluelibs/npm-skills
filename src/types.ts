export type DependencySection =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";

export interface NpmSkillsConfig {
  only?: string[];
  custom?: Record<string, string>;
}

export interface ResolvedNpmSkillsConfig {
  only: string[];
  custom: Record<string, string>;
}

export interface PackageExportConfig {
  export?: string[];
}

export type PackageNpmSkillsConfig = false | PackageExportConfig;

export interface ProjectPackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  npmSkills?: NpmSkillsConfig;
  "npm-skills"?: NpmSkillsConfig;
}

export interface InstalledPackageJson {
  name?: string;
  version?: string;
  npmSkills?: PackageNpmSkillsConfig;
  "npm-skills"?: PackageNpmSkillsConfig;
}

export interface ExtractOptions {
  cwd?: string;
  outputDir?: string;
  only?: string[];
  packageNames?: string[];
  includeDevDependencies?: boolean;
  override?: boolean;
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
  reason: "declined" | "non-interactive" | "missing-source" | "package-opt-out";
}

export interface ExtractReport {
  outputDir: string;
  scannedPackages: string[];
  extracted: ExtractedSkill[];
  skipped: SkippedSkill[];
}

export interface CliDependencies {
  stdout: Pick<typeof console, "log" | "error">;
  logger: Logger;
  prompt?: OverwritePrompt;
  isInteractive: boolean;
}
