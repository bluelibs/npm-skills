# npm-skills

`npm-skills` gives npm packages a simple, standard way to ship AI skills.

If a package exposes a `skills/` folder containing one or more skill directories with a `SKILL.md`, this tool can extract them into your local project with one command.

That means package authors get a predictable convention, and consumers get a clean DX instead of custom copy scripts, mystery folders, and ritual sacrifice to the filesystem gods.

## Why

- Standard package convention: skills live under `skills/` by default
- Zero-friction extraction: `npx npm-skills extract`
- CLI-first workflow for real projects
- Works across all installed dependency types by default
- Package-specific skill roots via `package.json` config
- Safe overwrite behavior with prompts in TTY mode
- Programmatic API for tool builders
- TypeScript-first
- Built with `tsup` and published as both CJS and ESM
- 100% code coverage enforced in QA

## Install

```bash
npm install -D npm-skills
```

Or use it directly without installing:

```bash
npx npm-skills extract
```

## CLI First

The CLI is the primary way this package is meant to be used.

In most projects you will not need the programmatic API at all. You install it, run `extract`, and move on with your day like the productivity wizard you were always told you could become.

## Fastest Setup

Install and add a script:

```json
{
  "scripts": {
    "skills:extract": "npm-skills extract"
  }
}
```

Then run:

```bash
npm run skills:extract
```

## Postinstall Hook

If you want skills to stay automatically synced after installs, wire it into `postinstall`:

```json
{
  "scripts": {
    "postinstall": "npm-skills extract --override"
  }
}
```

That makes the package feel nearly invisible in the best possible way:

- install dependencies
- skills appear
- everyone feels smarter than they were five minutes ago

If you prefer to avoid automatic overwrites, use a dedicated script instead of `postinstall`.

## Skill Convention

By default, a package exposes skills like this:

```txt
my-package/
  package.json
  skills/
    release-notes/
      SKILL.md
      template.md
    bug-hunt/
      SKILL.md
      checklist.md
```

Any directory that contains a `SKILL.md` is treated as a skill root and copied recursively with all of its files.

## Package-Side Export Control

By default, all discovered skills are exportable.

If a package wants to export only some skill trees, it can declare that in its own `package.json`:

```json
{
  "npmSkills": {
    "export": ["runner"]
  }
}
```

With this structure:

```txt
skills/
  runner/
    architecture/
      SKILL.md
    testing/
      SKILL.md
  internal/
    notes/
      SKILL.md
```

`export: ["runner"]` will export everything under the top-level `runner/` tree and skip `internal/`.

If a package wants to disable skill export entirely:

```json
{
  "npmSkills": false
}
```

The legacy `npm-skills` key is also supported for this metadata.

## Quick Start

Extract every matching installed package into a local `skills/` folder:

```bash
npx npm-skills extract
```

Extract into a custom output directory:

```bash
npx npm-skills extract --output .agents/skills
```

Only extract specific packages:

```bash
npx npm-skills extract @bluelibs/runner my-package
```

Only extract packages matching patterns:

```bash
npx npm-skills extract --only @bluelibs/*,my-package
```

Include or exclude dev dependencies explicitly:

```bash
npx npm-skills extract --dev=true
npx npm-skills extract --dev=false
```

Force overwrite existing extracted skills:

```bash
npx npm-skills extract --override
```

Recommended everyday versions:

```bash
npm-skills extract
npm-skills extract --override
npm-skills extract --only @bluelibs/*
```

## Output Naming

Extracted skills are copied into package-prefixed folders to avoid collisions.

Example:

```txt
@bluelibs/runner + skills/release-notes
=> skills/bluelibs-runner-release-notes
```

This keeps things deterministic and avoids two packages both trying to own `writer/` like roommates who each bought the same chair.

## Overwrite Behavior

`npm-skills` is intentionally conservative.

- If the destination folder does not exist, it copies the skill
- If the destination exists and you pass `--override`, it replaces it fully
- If the destination exists in an interactive terminal, it asks `y/N`
- If the destination exists in non-interactive mode, it skips and warns

When overriding, the existing extracted skill folder is removed and re-copied from source so stale files do not linger around like ghosts from previous releases.

## `package.json` Configuration

You can configure extraction from the consuming project’s `package.json`.

Supported keys:

- `npmSkills`
- `npm-skills`

Example:

```json
{
  "npmSkills": {
    "only": ["@bluelibs/*", "my-package"],
    "custom": {
      "@bluelibs/runner": ".agents/skills",
      "some-package": "resources/skills"
    }
  }
}
```

### Config Fields

`only`

- Optional array of package filters
- Supports exact package names and `*` wildcards
- Used when CLI filters are not provided

`custom`

- Optional per-package source folder overrides
- Default source root is `skills`
- Values are resolved relative to the installed package root

So if you configure:

```json
{
  "npmSkills": {
    "custom": {
      "@bluelibs/runner": ".agents/skills"
    }
  }
}
```

then `npm-skills` will look for skills inside:

```txt
node_modules/@bluelibs/runner/.agents/skills
```

instead of:

```txt
node_modules/@bluelibs/runner/skills
```

This consumer-side config is separate from the package-side `npmSkills.export` metadata described above:

- consumer config decides where to read skills from for a given installed package
- package config decides which skill trees are exportable, if any

## CLI Reference

### `extract`

```bash
npx npm-skills extract [package-a package-b ...] [options]
```

Options:

- `--output <dir>`: destination folder, defaults to `skills`
- `--only <patterns>`: comma-separated package filters such as `@scope/*,pkg-a`
- `--dev <true|false>`: include dev dependencies, defaults to `true`
- `--override`: replace existing extracted skills without prompting

Examples:

```bash
npx npm-skills extract
npx npm-skills extract @bluelibs/runner
npx npm-skills extract --only @bluelibs/* --output .agents/skills
npx npm-skills extract my-package --override
```

### Recommended CLI Flows

Extract everything:

```bash
npm-skills extract
```

Extract only one ecosystem:

```bash
npm-skills extract --only @bluelibs/*
```

Extract only specific packages:

```bash
npm-skills extract @bluelibs/runner my-package
```

Keep local skills in sync after installs:

```json
{
  "scripts": {
    "postinstall": "npm-skills extract --override"
  }
}
```

## Programmatic API

This exists for integrations and tooling, but it is secondary to the CLI.

You can also use the extractor directly:

```ts
import { extractSkills } from "npm-skills";

const report = await extractSkills({
  cwd: process.cwd(),
  outputDir: "skills",
  only: ["@bluelibs/*"],
  includeDevDependencies: true,
  override: false,
});

console.log(report.extracted);
console.log(report.skipped);
```

### Returned Report

`extractSkills()` returns:

```ts
interface ExtractReport {
  outputDir: string;
  scannedPackages: string[];
  extracted: Array<{
    packageName: string;
    sourceDir: string;
    destinationDir: string;
    destinationName: string;
  }>;
  skipped: Array<{
    packageName: string;
    sourceDir: string;
    destinationDir: string;
    reason: "declined" | "non-interactive" | "missing-source";
  }>;
}
```

## What Gets Scanned

By default, `npm-skills` scans:

- `dependencies`
- `optionalDependencies`
- `peerDependencies`
- `devDependencies`

Pass `--dev=false` or `includeDevDependencies: false` to exclude dev dependencies.

## Build and Compatibility

The package is built with `tsup` and ships:

- CommonJS via `.cjs`
- ESM via `.mjs`
- Type declarations via `dist/types`

That means it works nicely whether your project prefers `require()` or `import`.

## Quality Bar

This package is built with a strict QA pipeline:

- 100% code coverage
- linting
- type checking
- build verification

Run it locally with:

```bash
npm run qa
```

## Package Author Tips

If you want your package to expose skills cleanly:

1. Put them in `skills/` unless you have a strong reason not to.
2. Make every skill a folder with a `SKILL.md`.
3. Keep related assets beside the `SKILL.md`.
4. Avoid surprising dynamic generation when a plain file tree will do.

Simple beats clever here. Your future users will thank you, and your future self will complain less.

## License

MIT
