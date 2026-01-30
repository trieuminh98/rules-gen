# rules-gen

Generate Cursor rules and Codex agents from a shared hub repo. Supports both
rules and skills entry points.

## What it does

- **Rules**: pulls Markdown under `rules/**` and outputs:
  - Cursor rules at `.cursor/rules/**/*.mdc`
  - Codex bundle at `AGENTS.md`
- **Skills**: pulls Markdown under `skills/**` and outputs:
  - Shared skills at `.agent/skills/**/*.md`
  - `.cursor/skills` and `.codex/skills` are symlinks to `.agent/skills`

## Install & build

```bash
pnpm install
pnpm build
```

## Usage

```bash
rules-gen --repo <git-url> [options]
```

Examples:

```bash
# Generate both rules and skills (default)
rules-gen --repo https://github.com/org/rules-hub.git

# Only rules
rules-gen --repo https://github.com/org/rules-hub.git --kind rules

# Only skills
rules-gen --repo https://github.com/org/rules-hub.git --kind skills

# Cursor only
rules-gen --repo https://github.com/org/rules-hub.git --out cursor
```

## CLI options

- `--repo <git-url>`: required. The hub repo to clone (main branch).
- `--spec <rules.yaml>`: optional spec file (defaults to `rules.yaml` if present).
- `--kind <list>`: `rules,skills` (default). Use one or both.
- `--out <list>`: `cursor,codex` (default). Use one or both.
- `--cursor-out <path>`: rules Cursor output (default `.cursor/rules`).
- `--codex-out <path>`: rules Codex output (default `AGENTS.md`).
  - Can be a file or directory. If a directory, `AGENTS.md` is written inside it.
- `--skills-cursor-out <path>`: skills Cursor symlink path (default `.cursor/skills`).
- `--skills-codex-out <path>`: skills Codex symlink path (default `.codex/skills`).
- `--skills-root <path>`: skills shared output folder (default `.agent/skills`).
  - All must be directories.

## Spec format (rules.yaml)

New format (recommended):

```yaml
rules:
  sources:
    - rules/**/*.rules.md
    - rules/**/*.md
  overlays: []
  outputs:
    cursor:
      path: .cursor/rules
    codex:
      path: AGENTS.md

skills:
  sources:
    - skills/**/*.md
  overlays: []
  outputs:
    agent:
      path: .agent/skills
    cursor:
      path: .cursor/skills
    codex:
      path: .codex/skills
```

Legacy format (treated as `rules`):

```yaml
sources:
  - rules/**/*.rules.md
  - rules/**/*.md
overlays: []
outputs:
  cursor:
    path: .cursor/rules
  codex:
    path: AGENTS.md
```

## Targets in Markdown

Use target comments to include content for specific outputs:

```md
<!-- target:all -->

Visible in both Cursor and Codex.

<!-- target:cursor -->

Cursor-only content.

<!-- target:codex -->

Codex-only content.
```

Notes:

- Rules use target filtering for Cursor vs Codex.
- Skills include all targets because the output is shared.

## Frontmatter (rules)

For rules, frontmatter drives Codex bundling behavior:

- `description`: short summary (printed in AGENTS).
- `globs`: array of globs (printed in AGENTS).
- `alwaysApply`: boolean.
  - `true` => inline full rule into `AGENTS.md`.
  - `false` => only link to the Cursor rule path.

Example:

```yaml
---
description: General code style
globs: ["**/*.ts", "**/*.tsx"]
alwaysApply: true
---
```

## Notes

- Outputs are added to `.gitignore` automatically.
- Overlays are appended to each source file before extraction (MVP behavior).
- Skills are generated once into the shared folder and linked for both Cursor and Codex.
