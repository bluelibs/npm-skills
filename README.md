<p align="center">
  <img src="https://raw.githubusercontent.com/bluelibs/npm-skills/main/assets/npm-skills-logo.png" alt="npm-skills logo" width="420" />
</p>
<p align="center">
  <img src="https://img.shields.io/badge/node-22%2B-339933?logo=node.js&logoColor=white" alt="Node 22+" />
  <img src="https://img.shields.io/badge/coverage-100%25-16a34a" alt="100% test coverage" />
  <img src="https://img.shields.io/badge/bun-stable-f9f1e1?logo=bun&logoColor=111111" alt="Bun supported" />
  <img src="https://img.shields.io/badge/deno-stable-000000?logo=deno&logoColor=white" alt="Deno supported" />
  <br />
  <img src="https://img.shields.io/badge/linux-fcc624?logo=linux&logoColor=111111" alt="Linux" />
  <img src="https://img.shields.io/badge/macos-111111?logo=apple&logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/windows-0078d4?logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/AGENTS.md-compatible-2563eb" alt="AGENTS.md compatible" />
</p>

`npm-skills` helps npm packages ship AI skills in a way that's easy to version, distribute, and extract. Put `SKILL.md`-based skills in a package, then copy them into your workspace with one command.

<!--readme-variant-links:start-->

> Prefer the polished version of this guide?
> Browse the docs site at [npm-skills.com](https://npm-skills.com).

<!--readme-variant-links:end-->

It gives package authors a predictable convention and gives consuming teams a clean way to keep skills alongside the projects that use them. Skills travel with your dependencies, stay compatible with `AGENTS.md` and `SKILL.md` workflows, land locally in `.agents/skills`, and stay fully customizable when your team needs different source paths, output paths, filters, or package mappings.

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
- Bun: supported for CLI usage, including `--skip-production`
- Deno: supported for CLI usage through the CommonJS entry, including the `NODE_ENV` fallback via `Deno.env.get("NODE_ENV")` for `--skip-production`

The CLI is the primary way this package is meant to be used. In most projects you will not need the programmatic API at all, which is nice because we all deserve at least one tool in life that does not begin with "first, write a wrapper."

## Quick Start

Install it in your project:

```bash
npm install npm-skills
```

Or use it directly:

```bash
npm-skills extract
npm-skills --help
```

Bun users can also run the packaged CLI directly:

```bash
bunx npm-skills extract
```

Deno users can run the package directly through Deno's npm support:

```bash
deno run -A npm:npm-skills@latest extract --skip-production
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

If you want skills to stay automatically synced after installs, install `npm-skills` as a regular dependency and wire it into `postinstall`:

```json
{
  "scripts": {
    "postinstall": "npm-skills extract --skip-production --override"
  }
}
```

That keeps the binary available in environments where `postinstall` runs, and `--skip-production` makes the command exit cleanly and silently when `NODE_ENV` is `production`.

If you prefer to avoid automatic overwrites, keep extraction as an explicit script instead of `postinstall`.

Maintainers can verify the Bun and Deno CLI paths locally with:

```bash
npm run qa:local
```

That runs the normal QA flow plus runtime smoke tests for Bun and Deno. The smoke step skips automatically on CI.

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

Pass `--devDependencies=false` or `includeDevDependencies: false` to exclude dev dependencies.

Generated local skills include a `LICENSE.txt`.

## Configuration

You can configure both sides of the workflow with a dedicated `npm-skills.policy.json` file or from `package.json` using the `npmSkills` key.

`npm-skills.policy.json` uses the same schema as `package.json.npmSkills`, but at the JSON file root:

```json
{
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
    "export": ["public", "react"],
    "refs": [
      {
        "source": "readmes",
        "destination": "skills/core/references/readmes"
      }
    ]
  }
}
```

Config precedence is:

- `--policy <path>` on the CLI or `policyPath` in the API
- `./npm-skills.policy.json`
- `package.json.npmSkills`

If you prefer to keep config in `package.json`, the equivalent shape is:

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
      "export": ["public", "react"],
      "refs": [
        {
          "source": "readmes",
          "destination": "skills/core/references/readmes"
        }
      ]
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

`publish.refs`

- Optional list of shared docs or assets that should appear inside published skills
- Each entry uses a project-relative `source` and `destination`
- Intended for repos that keep canonical docs in places like `readmes/` or `docs/`, then link them into `skills/.../references/...` during development
- Pair it with `npm-skills refs materialize` in `prepack` and `npm-skills refs restore` in `postpack`

Example:

```json
{
  "scripts": {
    "prepack": "npm-skills refs materialize",
    "postpack": "npm-skills refs restore"
  },
  "npmSkills": {
    "publish": {
      "refs": [
        {
          "source": "readmes",
          "destination": "skills/core/references/readmes"
        },
        {
          "source": "guide-units",
          "destination": "skills/core/references/guide-units"
        }
      ]
    }
  }
}
```

This matches the pattern used in repos like `runner`: keep the docs authored once in top-level folders, symlink them into skill references while developing, materialize real files for the packed tarball, then restore the symlinks afterward.

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
npm-skills extract [package-a package-b ...] [options]
```

Options:

- `--cwd <dir>`: project root to operate from, defaults to the current working directory
- `--policy <path>`: read config from a dedicated JSON policy file
- `--output <dir>`: destination folder, overrides `consume.output` from the selected config or defaults to `.agents/skills`
- `--only <patterns>`: comma-separated package filters such as `@scope/*,pkg-a`
- `--skip-production`: skip extraction when `NODE_ENV` is `production`
- `--devDependencies <true|false>`: include dev dependencies in the package scan, defaults to `true`
- `--dev <true|false>`: deprecated alias for `--devDependencies`
- `--override`: replace existing extracted skills without prompting
- `--verbose`: show normal skip diagnostics such as packages without a `skills/` folder

Examples:

```bash
npm-skills extract
npm-skills --cwd packages/app extract
npm-skills extract --policy config/npm-skills/policy.json
npm-skills extract @bluelibs/runner my-package
npm-skills extract --only "@bluelibs/*" --output .agents/skills
npm-skills extract --skip-production
npm-skills extract --devDependencies=false
npm-skills extract --override
npm-skills extract --verbose
```

`--skip-production` only skips extraction when the current `NODE_ENV` is `production`. If `NODE_ENV` is unset, extraction still runs. `--devDependencies` controls whether `devDependencies` are included in the package scan. The old `--dev` flag is still accepted as an alias for compatibility, but `--devDependencies` is the clearer name going forward.

In a monorepo, the default stays local to the package you run from, so `packages/app` extracts into `packages/app/.agents/skills`.

### `new`

```bash
npm-skills new <skill-name> [options]
```

Options:

- `--cwd <dir>`: project root to operate from, defaults to the current working directory
- `--folder <dir>`: destination root for the new skill, defaults to `.agents/skills`

What it creates:

- a skill folder named after the sanitized skill name
- `SKILL.md` with Agent Skills-style frontmatter plus a practical starter template
- `LICENSE.txt` with an MIT license using `${currentYear}-present`
- `references/README.md` with prompts for longer examples, checklists, and notes

Examples:

```bash
npm-skills new my-skill
npm-skills --cwd packages/app new my-skill
npm-skills new release-notes --folder ./
```

### `refs`

```bash
npm-skills refs <materialize|restore> [options]
```

Modes and options:

- `--cwd <dir>`: project root to operate from, defaults to the current working directory
- `--policy <path>`: read config from a dedicated JSON policy file
- `materialize`: replace each configured destination with a copied snapshot of its source
- `restore`: replace each configured destination with a symlink back to its source

Examples:

```bash
npm-skills refs materialize
npm-skills refs restore
npm-skills refs restore --policy config/npm-skills/policy.json
npm-skills --cwd packages/runner refs materialize
```

Recommended everyday commands:

```bash
npm-skills extract
npm-skills extract --override
npm-skills extract --only "@bluelibs/*"
npm-skills new my-skill
npm-skills refs materialize
```

## Programmatic API

This exists for integrations and tooling, but it is secondary to the CLI.

Extract skills directly:

```ts
import { extractSkills } from "npm-skills";

const report = await extractSkills({
  cwd: process.cwd(),
  policyPath: "config/npm-skills/policy.json",
  outputDir: ".agents/skills",
  only: ["@bluelibs/*"],
  skipProduction: true,
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

Sync shared publish refs:

```ts
import { syncSkillPublishRefs } from "npm-skills";

await syncSkillPublishRefs({
  cwd: process.cwd(),
  policyPath: "config/npm-skills/policy.json",
  mode: "materialize",
});
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
  skippedEnvironment?: {
    reason: "production";
    received: string;
  };
}
```

The package is built with `tsup` and ships:

- CommonJS via `.cjs`
- ESM via `.mjs`
- Type declarations via `dist/types`

If you are running under Deno today, prefer the CommonJS entry.

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
