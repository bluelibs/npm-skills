<h1 align="center">npm-skills</h1>
<p align="center">
  <img src="https://img.shields.io/badge/node-22%2B-339933?logo=node.js&logoColor=white" alt="Node 22+" />
  <img src="https://img.shields.io/badge/coverage-100%25-16a34a" alt="100% test coverage" />
  <img src="https://img.shields.io/badge/bun-exp-f9f1e1?logo=bun&logoColor=111111" alt="Bun experimental" />
  <img src="https://img.shields.io/badge/deno-exp-000000?logo=deno&logoColor=white" alt="Deno experimental" />
  <br />
  <img src="https://img.shields.io/badge/linux-fcc624?logo=linux&logoColor=111111" alt="Linux" />
  <img src="https://img.shields.io/badge/macos-111111?logo=apple&logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/windows-0078d4?logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/AGENTS.md-compatible-2563eb" alt="AGENTS.md compatible" />
</p>

`npm-skills` gives npm packages a simple, standard way to ship AI skills as part of the dependencies teams already install.

> Want the source code, issues, and release trail?
> Head to the [GitHub repository](https://github.com/bluelibs/npm-skills).

If a package exposes a `skills/` folder containing one or more skill directories with a `SKILL.md`, this tool can extract them into your local `.agents/skills` folder with one command, keeping the output in the current project even when you run it from `packages/*` and fitting neatly into AGENTS.md-style repos.

That means package authors get a predictable convention, and consumers get a clean DX instead of custom copy scripts, mystery folders, and ritual sacrifice to the filesystem gods.

## Overview

`npm-skills` is for shipping skills inside ordinary npm packages, versioning them with `package.json`, moving them through private registries, and extracting them into the workspace where they are actually used.

It follows conventions people already recognize from the [`skills.sh` ecosystem](https://skills.sh/docs), the [`SKILL.md`-based format used by the open `skills` tool](https://github.com/vercel-labs/skills#creating-skills), and [`AGENTS.md`](https://agents.md/)-style repos:

- any directory containing `SKILL.md` is treated as a skill root
- support files live beside that `SKILL.md`
- packages usually publish from `skills/`
- consuming projects usually extract into `.agents/skills/`

`skills.sh` is a strong fit when you want a hosted catalog and public discovery. `npm-skills` is for distributing skills as part of your dependency graph.

`npm-skills` officially targets Node `>=22`.

- Node: officially supported for both the CLI and programmatic API
- Bun: the published artifacts may work, but Bun is not officially tested yet
- Deno: the published artifacts may work with the usual file and system permissions, but Deno is not officially tested yet

The CLI is the primary way this package is meant to be used. In most projects you will not need the programmatic API at all, which is nice because we all deserve at least one tool in life that does not begin with "first, write a wrapper."

## Quick Start

Install it:

```bash
npm install -D npm-skills
```

Or use it directly:

```bash
npx npm-skills extract
npx npm-skills --help
```

Bun users can skip the `n` and keep their startup time smug:

```bash
bunx npm-skills extract
```

Add a script:

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

If you want skills to stay automatically synced after installs, wire it into `prepare`:

```json
{
  "scripts": {
    "prepare": "npm-skills extract --override"
  }
}
```

`prepare` runs after every `npm install` in development but is skipped in production installs (`--omit=dev`), so the script won't fail when `npm-skills` is a devDependency and the binary is absent. Avoid `postinstall` for this reason.

If you prefer to avoid automatic overwrites, keep extraction as an explicit script instead of `prepare`.

## Skill Sharing Pattern

If your repo both authors its own skills and extracts skills from dependencies, prefer giving extracted content its own lane under `.agents/skills/extracted`.

This is a recommended pattern, not the default. If you do nothing, extraction still defaults to `.agents/skills`.

That keeps local skills easy to curate, keeps sync cleanup scoped to imported content, and keeps Git from collecting extracted folders like a very enthusiastic raccoon.

Recommended layout:

```txt
.agents/
  skills/
    my-local-skill/
      SKILL.md
    extracted/
      .gitignore
      bluelibs-runner-release-notes/
```

Use a dedicated `.gitignore` in that extraction folder:

```gitignore
*
```

Quick setup:

Make sure `.agents/skills/extracted` exists, then run:

```bash
printf "*\n" > .agents/skills/extracted/.gitignore
npx npm-skills extract --output .agents/skills/extracted
```

Script example:

```json
{
  "scripts": {
    "skills:extract": "npm-skills extract --output .agents/skills/extracted"
  }
}
```

`package.json` setting example:

```json
{
  "npmSkills": {
    "consume": {
      "output": ".agents/skills/extracted"
    }
  }
}
```

`--output` still overrides the package setting when you need a one-off destination.

## How Extraction Works

Skill discovery stays predictable:

- scan under a configured source folder
- treat any directory containing `SKILL.md` as a skill root
- copy that directory recursively as-is

Package-side layout usually looks like this:

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

Extracted skills are copied into package-prefixed folders to avoid collisions:

```txt
@bluelibs/runner + skills/release-notes
=> .agents/skills/bluelibs-runner-release-notes
```

Overwrite behavior is intentionally conservative:

- if the destination folder does not exist, it copies the skill
- if the destination exists and you pass `--override`, it replaces it fully
- if the destination exists in an interactive terminal, it asks `y/N`
- if the destination exists in non-interactive mode, it skips and warns
- if a package simply has no discoverable skills source, it skips quietly by default because that is normal
- if a listed package is not currently resolvable from `node_modules`, it skips and warns instead of aborting the whole run
- full syncs also remove stale folders from earlier extractions in the chosen output directory, without touching unrelated folders there

By default, `npm-skills` scans:

- `dependencies`
- `optionalDependencies`
- `peerDependencies`
- `devDependencies`

Pass `--dev=false` or `includeDevDependencies: false` to exclude dev dependencies.

Generated local skills include a `LICENSE.txt`.

## Configuration

You can configure both sides of the workflow from `package.json` using the `npmSkills` key:

- `consume`: how this project reads skills from installed dependencies
- `publish`: how this package exposes its own skills to others

Example:

```json
{
  "npmSkills": {
    "consume": {
      "only": ["@scope/*", "my-package"],
      "output": ".agents/skills/extracted",
      "map": {
        "@bluelibs/runner": ".agents/skills",
        "some-package": "resources/skills"
      }
    },
    "publish": {
      "source": ".agents/skills",
      "export": ["public", "react"]
    }
  }
}
```

`consume.only`

- Optional array of package filters
- Supports exact package names and `*` wildcards
- Used when CLI filters are not provided

`consume.map`

- Optional per-package source folder overrides
- Default source folder is `skills`
- Values are resolved relative to the installed package folder

`consume.output`

- Optional default extraction destination for this consumer project
- Defaults to `.agents/skills`
- Useful when you want extracted skills to live under `.agents/skills/extracted`
- `--output` on the CLI and `outputDir` in the API still override it

`publish.source`

- Optional source folder for skills this package publishes
- Defaults to `skills`
- Useful when your repo authors skills under `.agents/skills`

`publish.export`

- Optional list of top-level skill folders to expose
- If omitted, every discovered skill under `publish.source` can be published
- If set to `false`, this package opts out of skill publishing

If a package wants to export only some skill folders:

```json
{
  "npmSkills": {
    "publish": {
      "source": ".agents/skills",
      "export": ["runner"]
    }
  }
}
```

With this structure:

```txt
.agents/skills/
  runner/
    architecture/
      SKILL.md
    testing/
      SKILL.md
  internal/
    notes/
      SKILL.md
```

`publish.export: ["runner"]` will export everything under the top-level `runner/` folder and skip `internal/`.

If a package wants to disable skill export entirely:

```json
{
  "npmSkills": {
    "publish": false
  }
}
```

Consumer-side config and package-side config are separate:

- consumer config decides where to read skills from for a given installed package
- package config decides where this package publishes skills from, and which skill folders can be published

## CLI

### `extract`

```bash
npx npm-skills extract [package-a package-b ...] [options]
```

Options:

- `--output <dir>`: destination folder, overrides `npmSkills.consume.output` or defaults to `.agents/skills`
- `--only <patterns>`: comma-separated package filters such as `@scope/*,pkg-a`
- `--dev <true|false>`: include dev dependencies, defaults to `true`
- `--override`: replace existing extracted skills without prompting
- `--verbose`: show normal skip diagnostics such as packages without a `skills/` folder

Examples:

```bash
npx npm-skills extract
npx npm-skills extract @bluelibs/runner my-package
npx npm-skills extract --only "@bluelibs/*" --output .agents/skills
npx npm-skills extract --dev=false
npx npm-skills extract --override
npx npm-skills extract --verbose
```

In a monorepo, the default stays local to the package you run from, so `packages/app` extracts into `packages/app/.agents/skills`.

### `new`

```bash
npx npm-skills new <skill-name> [options]
```

Options:

- `--folder <dir>`: destination root for the new skill, defaults to `.agents/skills`

What it creates:

- a skill folder named after the sanitized skill name
- `SKILL.md` with Agent Skills-style frontmatter plus a practical starter template
- `LICENSE.txt` with an MIT license using `${currentYear}-present`
- `references/README.md` with prompts for longer examples, checklists, and notes

Examples:

```bash
npx npm-skills new my-skill
npx npm-skills new release-notes --folder ./
```

Recommended everyday commands:

```bash
npm-skills extract
npm-skills extract --override
npm-skills extract --only "@bluelibs/*"
npm-skills new my-skill
```

## Programmatic API

This exists for integrations and tooling, but it is secondary to the CLI.

Extract skills directly:

```ts
import { extractSkills } from "npm-skills";

const report = await extractSkills({
  cwd: process.cwd(),
  outputDir: ".agents/skills",
  only: ["@bluelibs/*"],
  includeDevDependencies: true,
  override: false,
  verbose: false,
});

console.log(report.extracted);
console.log(report.skipped);
```

Create a local skill template:

```ts
import { createSkillTemplate } from "npm-skills";

const report = await createSkillTemplate({
  cwd: process.cwd(),
  skillName: "my-skill",
});

console.log(report.skillDir);
```

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
    reason:
      | "declined"
      | "missing-package"
      | "non-interactive"
      | "missing-source"
      | "package-opt-out";
  }>;
}
```

The package is built with `tsup` and ships:

- CommonJS via `.cjs`
- ESM via `.mjs`
- Type declarations via `dist/types`

If you are running under Deno today, prefer the CommonJS entry. This is an experimental path rather than part of the verified support matrix.

```ts
import { extractSkills } from "./node_modules/npm-skills/dist/index.cjs";
```

## Notes for Package Authors

If you want your package to expose skills cleanly:

1. Put them in `skills/` unless you have a strong reason not to.
2. Make every skill a folder with a `SKILL.md`.
3. Keep related assets beside the `SKILL.md`.
4. Avoid surprising dynamic generation when a plain file tree will do.

This package is built with a strict QA pipeline:

- 100% code coverage
- linting
- type checking
- build verification

Run it locally with:

```bash
npm run qa
```

## License

MIT
