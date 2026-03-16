import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const sourcePath = resolve(repoRoot, "README.md");
const destinationPath = resolve(repoRoot, "pages", "README.md");
const variantStartMarker = "<!--readme-variant-links:start-->";
const variantEndMarker = "<!--readme-variant-links:end-->";
const pagesVariantBlock = [
  "> Want the source code, issues, and release trail?",
  "> Head to the [GitHub repository](https://github.com/bluelibs/npm-skills).",
].join("\n");

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

  return `${beforeVariant}${pagesVariantBlock}${afterVariant}`;
}

export async function syncPagesReadme() {
  await mkdir(dirname(destinationPath), { recursive: true });
  const sourceContent = await readFile(sourcePath, "utf8");
  const pagesReadmeContent = createPagesReadmeContent(sourceContent);

  await writeFile(destinationPath, pagesReadmeContent, "utf8");

  console.log(`Synced ${sourcePath} -> ${destinationPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await syncPagesReadme();
}
