import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { extractSkills } from "./extract";
import { splitCommaSeparatedValues } from "./patterns";
import { CliDependencies, ExtractOptions, OverwritePrompt } from "./types";

export interface ParsedCliArgs {
  command: "extract";
  options: ExtractOptions;
}

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined) return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const [command, ...rest] = argv;
  if (!command) throw new Error("Missing command. Supported command: extract");
  if (command !== "extract") throw new Error(`Unsupported command: ${command}`);

  const options: ExtractOptions = {};
  const packageNames: string[] = [];

  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];

    if (arg === "--output") {
      options.outputDir = rest[++index];
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.outputDir = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--only") {
      options.only = splitCommaSeparatedValues(rest[++index]);
      continue;
    }

    if (arg.startsWith("--only=")) {
      options.only = splitCommaSeparatedValues(arg.slice("--only=".length));
      continue;
    }

    if (arg === "--dev") {
      options.includeDevDependencies = parseBoolean(rest[++index], true);
      continue;
    }

    if (arg.startsWith("--dev=")) {
      options.includeDevDependencies = parseBoolean(
        arg.slice("--dev=".length),
        true,
      );
      continue;
    }

    if (arg === "--override") {
      options.override = true;
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
      info: (message) => console.log(message),
      warn: (message) => console.warn(message),
    },
    prompt: createInteractivePrompt(isInteractive),
    isInteractive,
  };
}

export async function runCli(
  argv: string[],
  dependencies: CliDependencies = createDefaultDependencies(),
): Promise<number> {
  try {
    const parsed = parseCliArgs(argv);
    const report = await extractSkills({
      ...parsed.options,
      logger: dependencies.logger,
      prompt: parsed.options.override ? undefined : dependencies.prompt,
    });

    dependencies.stdout.log(
      `Extracted ${report.extracted.length} skill(s) from ${report.scannedPackages.length} package(s) into ${report.outputDir}.`,
    );
    if (report.skipped.length > 0) {
      dependencies.stdout.log(`Skipped ${report.skipped.length} skill(s).`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dependencies.stdout.error(message);
    return 1;
  }
}
