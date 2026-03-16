export function splitCommaSeparatedValues(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
}

export function matchesPattern(value: string, pattern: string): boolean {
  return wildcardToRegExp(pattern).test(value);
}

export function matchesAnyPattern(value: string, patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  return patterns.some((pattern) => matchesPattern(value, pattern));
}

export function sanitizeName(value: string): string {
  return value
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .toLowerCase();
}

export function sanitizePathSegment(value: string): string {
  const sanitized = value
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .toLowerCase();

  return sanitized || "skill";
}

export function sanitizePathSegments(value: string): string {
  return value
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => sanitizePathSegment(segment))
    .join("--");
}
