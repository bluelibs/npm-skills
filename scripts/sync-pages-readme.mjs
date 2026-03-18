import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const sourcePath = resolve(repoRoot, "README.md");
const destinationPath = resolve(repoRoot, "pages", "README.md");
export const pagesReadmeAssetPaths = ["assets/npm-skills-logo.png"];
const variantStartMarker = "<!--readme-variant-links:start-->";
const variantEndMarker = "<!--readme-variant-links:end-->";
const pagesVariantLines = [
  "> Want the source code, issues, and release trail?",
  "> Head to the [GitHub repository](https://github.com/bluelibs/npm-skills).",
];

function detectLineEnding(content) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeLineEndings(content, lineEnding) {
  return content.replace(/\r?\n/g, lineEnding);
}

export function createPagesReadmeContent(sourceContent) {
  const startIndex = sourceContent.indexOf(variantStartMarker);
  const endIndex = sourceContent.indexOf(variantEndMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(
      "README.md is missing the readme variant markers required for Pages sync.",
    );
  }

  const beforeVariant = sourceContent.slice(0, startIndex);
  const afterVariant = sourceContent.slice(
    endIndex + variantEndMarker.length,
  );
  const lineEnding = detectLineEnding(sourceContent);
  const pagesVariantBlock = pagesVariantLines.join(lineEnding);

  return `${beforeVariant}${pagesVariantBlock}${afterVariant}`;
}

export async function syncPagesReadme() {
  await mkdir(dirname(destinationPath), { recursive: true });
  await syncPagesReadmeAssets();
  const sourceContent = await readFile(sourcePath, "utf8");
  const nextPagesReadmeContent = createPagesReadmeContent(sourceContent);
  const existingDestinationContent = await readFile(destinationPath, "utf8").catch(
    (error) => {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    },
  );
  const destinationLineEnding = existingDestinationContent
    ? detectLineEnding(existingDestinationContent)
    : detectLineEnding(sourceContent);
  const pagesReadmeContent = normalizeLineEndings(
    nextPagesReadmeContent,
    destinationLineEnding,
  );

  if (existingDestinationContent === pagesReadmeContent) {
    console.log(`Pages README already up to date at ${destinationPath}`);
    return;
  }

  await writeFile(destinationPath, pagesReadmeContent, "utf8");

  console.log(`Synced ${sourcePath} -> ${destinationPath}`);
}

export async function syncPagesReadmeAssets(destinationDir = resolve(repoRoot, "pages")) {
  await mkdir(destinationDir, { recursive: true });

  await Promise.all(
    pagesReadmeAssetPaths.map(async (assetPath) => {
      const destinationPath = resolve(destinationDir, assetPath);
      await mkdir(dirname(destinationPath), { recursive: true });
      await cp(resolve(repoRoot, assetPath), destinationPath);
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await syncPagesReadme();
}
