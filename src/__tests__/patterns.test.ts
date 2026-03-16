import {
  matchesAnyPattern,
  matchesPattern,
  sanitizeName,
  sanitizePathSegment,
  sanitizePathSegments,
  splitCommaSeparatedValues,
  wildcardToRegExp,
} from "../patterns";

describe("patterns", () => {
  it("splits comma separated values", () => {
    expect(splitCommaSeparatedValues("a, b ,,c")).toEqual(["a", "b", "c"]);
    expect(splitCommaSeparatedValues(undefined)).toEqual([]);
  });

  it("matches wildcard patterns", () => {
    expect(matchesPattern("@bluelibs/runner", "@bluelibs/*")).toBe(true);
    expect(matchesPattern("left-pad", "@bluelibs/*")).toBe(false);
    expect(matchesAnyPattern("left-pad", [])).toBe(true);
    expect(matchesAnyPattern("left-pad", ["@bluelibs/*", "left-*"])).toBe(true);
    expect(wildcardToRegExp("a.b*").test("a.bzzz")).toBe(true);
  });

  it("sanitizes folder names", () => {
    expect(sanitizeName("@bluelibs/runner")).toBe("bluelibs-runner");
    expect(sanitizeName("nested/path")).toBe("nested-path");
    expect(sanitizeName("Already--Clean")).toBe("already-clean");
    expect(sanitizePathSegment("Runner_Core")).toBe("runner_core");
    expect(sanitizePathSegment("!!!")).toBe("skill");
    expect(sanitizePathSegments("runner/core")).toBe("runner--core");
    expect(sanitizePathSegments("runner-core")).toBe("runner-core");
  });
});
