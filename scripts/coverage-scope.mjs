import path from "path";

export function toPosixPath(filePath) {
  return String(filePath).replaceAll("\\", "/");
}

export function isInCoverageScope(relPosix) {
  if (!relPosix.startsWith("src/")) return false;
  if (relPosix.endsWith(".d.ts")) return false;
  if (!(relPosix.endsWith(".ts") || relPosix.endsWith(".tsx"))) return false;
  if (relPosix.endsWith(".test.ts")) return false;
  return true;
}

export function toCoverageScopedRelPosixPath(absPath) {
  const rel = path.relative(process.cwd(), absPath);
  return toPosixPath(rel);
}
