## General Principles

- Be precise, thoughtful, and clear.
- Do not modify or revert someone else's changes without confirmation.
- Design for clarity before cleverness.
- Keep code human-friendly with descriptive names and comments that explain why.
- Keep the repository license as `LICENSE.md`.
- Generated skills should include a `LICENSE.txt`.
- Keep functions small and decouple early so the code reads like a story.
- Keep non-documentation files small when practical, ideally under 300 lines.
- Think about contracts and acceptance criteria before implementation.
- Type strictness is mandatory. Avoid type assertions unless they are truly necessary.
- Use `npm run qa` to run coverage, linting, type checking, and build validation.
- Run focused tests while iterating when that is faster, then finish with `npm run qa`.
- If coverage is below 100% in untouched areas, do not game the config to hide it.
- Always run tests instead of assuming the change worked.
- Run commands directly instead of wrapping them in `bash -lc` or `zsh -lc`.
- Prefer relative imports.
- Keep imports at the top unless there is a strong reason not to.
- Do not ask the user whether to do the obvious next helpful thing.
- Use agent-friendly TODO lists and keep them current.
- Fail fast when inputs or environment are not as expected.

## Project Specifics

- This package targets 100% code coverage.
- Tests live in a mirror-like structure under `src/__tests__/`.
- The package exposes a CLI plus a small programmatic API, so both surfaces must stay type-safe and documented by the code structure.
- The package extracts skills from installed npm packages by copying skill directories recursively.
- Skill discovery should stay predictable: scan under a configured source root, treat any directory containing `SKILL.md` as a skill root, and copy that directory as-is.
- Prefer friendly warnings and explicit overwrite behavior over silent destructive actions.

## Changes

- Keep new features focused and avoid over-polluting files.
- Preserve 100% coverage with tests that exercise real behavior, not just happy paths.
- Comment the why, not the what.
- Never hide coverage gaps by excluding files from test config.
- Re-read this file before doing the final review pass.
