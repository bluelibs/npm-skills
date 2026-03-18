import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createPagesReadmeContent,
  syncPagesReadmeAssets,
} from "./sync-pages-readme.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const pagesSourceDir = resolve(repoRoot, "pages");

export async function buildPagesSite({
  outputDir = resolve(repoRoot, "dist", "pages"),
  repository = process.env.GITHUB_REPOSITORY || "",
  branch = process.env.GITHUB_REF_NAME || "main",
} = {}) {
  const [owner = "", repo = ""] = repository.split("/");
  const siteConfig = {
    repository,
    owner,
    repo,
    branch,
    readmePath: "README.md",
  };

  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true });
  await cp(pagesSourceDir, outputDir, { recursive: true });
  await syncPagesReadmeAssets(outputDir);
  const readmeContent = await readFile(resolve(repoRoot, "README.md"), "utf8");
  await writeFile(
    resolve(outputDir, "README.md"),
    createPagesReadmeContent(readmeContent),
    "utf8",
  );
  await writeFile(
    resolve(outputDir, "site-config.json"),
    `${JSON.stringify(siteConfig, null, 2)}\n`,
    "utf8",
  );

  console.log(`Prepared Pages site at ${outputDir}`);
}

function parseBuildPagesArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument.startsWith("--output=")) {
      options.outputDir = resolve(repoRoot, argument.slice("--output=".length));
      continue;
    }

    if (argument === "--output") {
      const nextArgument = argv[index + 1];
      if (!nextArgument) {
        throw new Error("Missing value for --output");
      }

      options.outputDir = resolve(repoRoot, nextArgument);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  return options;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await buildPagesSite(parseBuildPagesArgs(process.argv.slice(2)));
}
