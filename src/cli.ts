import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { extractSkills } from "./extract";
import { createSkillTemplate } from "./new-skill";
import { splitCommaSeparatedValues } from "./patterns";
import { syncSkillPublishRefs } from "./refs";
import {
  CliDependencies,
  CreateSkillTemplateOptions,
  ExtractOptions,
  OverwritePrompt,
  SyncRefsOptions,
} from "./types";

export interface ParsedExtractCliArgs {
  command: "extract";
  options: ExtractOptions;
}

export interface ParsedNewCliArgs {
  command: "new";
  options: CreateSkillTemplateOptions;
}

export interface ParsedRefsCliArgs {
  command: "refs";
  options: SyncRefsOptions;
}

export type ParsedCliArgs =
  | ParsedExtractCliArgs
  | ParsedNewCliArgs
  | ParsedRefsCliArgs;

const HELP_TEXT = `npm-skills

Usage:
  npm-skills extract [package-a package-b ...] [options]
  npm-skills new <skill-name> [options]
  npm-skills refs <materialize|restore>

Options:
  extract:
    --output <dir>     Destination directory. Overrides npmSkills.consume.output or .agents/skills
    --only <patterns>  Comma-separated package filters, for example "@scope/*,pkg-a"
    --skip-production  Skip extraction when NODE_ENV is production
    --devDependencies <true|false> Include devDependencies. Defaults to true
    --dev <true|false> Deprecated alias for --devDependencies
    --override         Replace existing extracted skills without prompting
    --verbose          Show normal skip diagnostics such as missing skills folders

  new:
    --folder <dir>     Template destination root. Defaults to .agents/skills

  refs:
    materialize        Copy configured ref sources into skill destinations
    restore            Recreate symlinks from skill destinations back to sources

  -h, --help           Show this help
`;

function parseBoolean(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function getRequiredOptionValue(
  rest: string[],
  index: number,
  optionName: string,
): string {
  const value = rest[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}`);
  }

  return value;
}

export function getHelpText(): string {
  return HELP_TEXT;
}

function parseExtractArgs(rest: string[]): ParsedExtractCliArgs {
  const options: ExtractOptions = {};
  const packageNames: string[] = [];

  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];

    if (arg === "--output") {
      options.outputDir = getRequiredOptionValue(rest, index, "--output");
      index++;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.outputDir = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--only") {
      options.only = splitCommaSeparatedValues(
        getRequiredOptionValue(rest, index, "--only"),
      );
      index++;
      continue;
    }

    if (arg.startsWith("--only=")) {
      options.only = splitCommaSeparatedValues(arg.slice("--only=".length));
      continue;
    }

    if (arg === "--skip-production") {
      options.skipProduction = true;
      continue;
    }

    if (arg === "--devDependencies" || arg === "--dev") {
      const nextArg = rest[index + 1];
      if (!nextArg || nextArg.startsWith("--")) {
        options.includeDevDependencies = true;
        continue;
      }
      options.includeDevDependencies = parseBoolean(nextArg);
      index++;
      continue;
    }

    if (arg.startsWith("--devDependencies=") || arg.startsWith("--dev=")) {
      const value = arg.startsWith("--devDependencies=")
        ? arg.slice("--devDependencies=".length)
        : arg.slice("--dev=".length);
      options.includeDevDependencies = parseBoolean(value);
      continue;
    }

    if (arg === "--override") {
      options.override = true;
      continue;
    }

    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    packageNames.push(arg);
  }

  if (packageNames.length > 0) options.packageNames = packageNames;
  return { command: "extract", options };
}

function parseNewArgs(rest: string[]): ParsedNewCliArgs {
  const options = {} as CreateSkillTemplateOptions;
  const skillNames: string[] = [];

  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];

    if (arg === "--folder") {
      options.folder = getRequiredOptionValue(rest, index, "--folder");
      index++;
      continue;
    }

    if (arg.startsWith("--folder=")) {
      options.folder = arg.slice("--folder=".length);
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    skillNames.push(arg);
  }

  if (skillNames.length === 0) {
    throw new Error("Missing skill name for new");
  }

  if (skillNames.length > 1) {
    throw new Error(
      `Unexpected extra arguments: ${skillNames.slice(1).join(" ")}`,
    );
  }

  options.skillName = skillNames[0];
  return { command: "new", options };
}

function parseRefsArgs(rest: string[]): ParsedRefsCliArgs {
  const [mode, ...extraArgs] = rest;

  if (!mode) {
    throw new Error("Missing mode for refs. Expected: materialize or restore");
  }

  if (extraArgs.length > 0) {
    throw new Error(`Unexpected extra arguments: ${extraArgs.join(" ")}`);
  }

  if (mode !== "materialize" && mode !== "restore") {
    throw new Error(`Unsupported refs mode: ${mode}`);
  }

  return {
    command: "refs",
    options: {
      mode,
    },
  };
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const [command, ...rest] = argv;
  if (!command)
    throw new Error("Missing command. Supported commands: extract, new, refs");
  if (command === "extract") return parseExtractArgs(rest);
  if (command === "new") return parseNewArgs(rest);
  if (command === "refs") return parseRefsArgs(rest);
  throw new Error(`Unsupported command: ${command}`);
}

export function createInteractivePrompt(
  isInteractive: boolean,
): OverwritePrompt | undefined {
  if (!isInteractive) return undefined;

  return {
    async confirmOverwrite(destinationDir: string) {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      try {
        const answer = await rl.question(
          `Overwrite existing skill at ${destinationDir}? (y/N) `,
        );
        return answer.trim().toLowerCase() === "y";
      } finally {
        rl.close();
      }
    },
  };
}

function createDefaultDependencies(): CliDependencies {
  const isInteractive = Boolean(stdin.isTTY && stdout.isTTY);
  return {
    stdout: console,
    logger: {
      info: console.debug,
      warn: (message) => console.warn(message),
    },
    prompt: createInteractivePrompt(isInteractive),
    isInteractive,
  };
}

function formatExtractSummary(
  extractedCount: number,
  scannedPackageCount: number,
  deletedSkills: number,
  isInteractive: boolean,
): string {
  const checkmark = isInteractive ? "\u001b[32m\u2713\u001b[0m" : "\u2713";
  const deletedSuffix =
    deletedSkills > 0 ? ` Deleted skills: ${deletedSkills}` : "";

  return `${checkmark} Imported ${extractedCount} skills from ${scannedPackageCount} total packages.${deletedSuffix}`;
}

export async function runCli(
  argv: string[],
  dependencies: CliDependencies = createDefaultDependencies(),
): Promise<number> {
  try {
    if (
      argv.length === 0 ||
      argv[0] === "help" ||
      argv.includes("--help") ||
      argv.includes("-h")
    ) {
      dependencies.stdout.log(getHelpText());
      return 0;
    }

    const parsed = parseCliArgs(argv);
    if (parsed.command === "extract") {
      const report = await extractSkills({
        ...parsed.options,
        logger: {
          // Keep install-time output compact while still surfacing warnings.
          info: () => undefined,
          warn: (message) => dependencies.logger.warn(message),
        },
        prompt: parsed.options.override ? undefined : dependencies.prompt,
      });

      if (report.skippedEnvironment) {
        return 0;
      }

      dependencies.stdout.log(
        formatExtractSummary(
          report.extracted.length,
          report.scannedPackages.length,
          report.deletedSkills,
          dependencies.isInteractive,
        ),
      );
      return 0;
    }

    if (parsed.command === "refs") {
      const report = await syncSkillPublishRefs({
        ...parsed.options,
        logger: dependencies.logger,
      });
      dependencies.stdout.log(
        `Synchronized ${report.synced.length} publish refs in ${report.mode} mode.`,
      );
      return 0;
    }

    const report = await createSkillTemplate(parsed.options);
    dependencies.stdout.log(`Created skill template at ${report.skillDir}.`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dependencies.stdout.error(message);
    return 1;
  }
}
