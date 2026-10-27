# Documentation as Code Reference

Markdown docs live in a `docs/` folder beside the `.c4` files. Opt-in via the `docs` config block. Docs embed live diagrams by view id, link to views and other docs, and can be exported to MkDocs/TechDocs or a portable Markdown bundle. With no `docs/` folder, behavior is unchanged.

## Config

Optional `docs` block on the project config:

```json
{
  "$schema": "https://likec4.dev/schemas/config.json",
  "name": "my-project",
  "docs": {
    "dir": "docs",
    "entry": "index",
    "landing": true
  }
}
```

| Key       | Type      | Default  | Notes                                                                                                                |
| --------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `dir`     | `string`  | `"docs"` | Docs folder, relative to config file folder.                                                                         |
| `entry`   | `string`  | —        | Landing doc route, relative to docs folder, **no extension**. Defaults to root `index.md`, else first top-level doc. |
| `landing` | `boolean` | `false`  | Make docs entry the project's default landing page. Opt-in.                                                          |

All keys optional; omitting `docs` keeps defaults.

## Folder & routes

```
docs/
├─ index.md            # → /docs   (entry)
├─ architecture.md     # → /docs/architecture
├─ nav.yaml            # optional
└─ adr/
   ├─ index.md         # → /docs/adr
   └─ 0001-use-event-bus.md   # → /docs/adr/0001-use-event-bus
```

- `.md` discovered recursively under `dir`.
- `index.md` → its folder route; root `index.md` → entry (`/docs`).
- Two files → same route: diagnostic (first sorted kept).
- Spaces in folder/file names supported (round-trip via per-segment `%20`).

## Navigation

Two mutually exclusive modes. `nav.yaml` present → used in full, convention ignored.

**Convention (default):** numeric `order` first (ascending), rest alphabetical by label. Label = frontmatter `title` → first `#` heading → humanized filename. Folder label/child-order from its `index.md` frontmatter (`title`, `order` number, or `order` array of child names).

```markdown
---
title: Architecture overview
order: 1
---
```

**Explicit `docs/nav.yaml`:** mkdocs-style; paths relative to docs dir, `.md` optional.

```yaml
nav:
  - Overview: index.md
  - Architecture: architecture.md
  - ADRs:
      - adr/0001-use-event-bus.md
      - Adopt LikeC4: adr/0002-adopt-likec4.md
```

- Tree built entirely from `nav.yaml`.
- Unlisted discovered files are **hidden** (build warning lists them).
- Label = explicit nav label, else page title.
- Non-existent target → diagnostic (entry kept). Malformed YAML / missing `nav:` → lenient fallback to convention.
- First nav doc = default entry, unless `docs.entry` overrides.

## Embed views

Reference a view by id in a ` ```likec4-view ` fenced block:

````markdown
```likec4-view
view: billing-flow
focus: billing.processor
dynamic: sequence
theme: auto
padding: 24
```
````

Body = one `key: value` per line.

| Key       | Required | Value                        |
| --------- | -------- | ---------------------------- |
| `view`    | yes      | View id, exactly once.       |
| `focus`   | no       | Element FQN.                 |
| `dynamic` | no       | `diagram` \| `sequence`.     |
| `theme`   | no       | `light` \| `dark` \| `auto`. |
| `padding` | no       | Non-negative integer.        |

Unknown key, missing value, missing `view`, or duplicate `view` → error. By id, never a baked image. Invalid ref → non-fatal placeholder. Bare ` ```likec4 ` fence is reserved (renders as plain code). ` ```mermaid ` renders client-side; parse error → non-fatal notice. No PlantUML in embedded docs.

## Links

- `likec4://view/<id>` with optional `?focus=…&dynamic=diagram|sequence` → in-app diagram route.
  `[billing flow](likec4://view/billing-flow?focus=billing.processor)`
- Relative `.md` links → `/docs/…` route; `#anchor` preserved.
  `[architecture](architecture.md)`, `[parent](../index.md)`

Unknown view or non-existent doc → diagnostic, link left unchanged. External/absolute/anchor-only untouched.

## ADRs

No scaffold command — convention only. Keep in `docs/adr/` as `NNNN-kebab-title.md` with frontmatter:

```markdown
---
title: Use an event bus
status: accepted
date: 2026-01-15
---
```

`status`/`date` are open frontmatter keys surfaced in the model. Link ADRs to views by id via ` ```likec4-view ` or `likec4://view/<id>`.

## Export / publish

Docs ship in `likec4 build` output. Three export commands (all require React + Playwright):

```bash
# content-hashed SVGs + images.json (view id → path); dynamic:sequence → sequence variant
bunx likec4 export image -p my-project -o ./docs/assets src/likec4

# MkDocs/Backstage TechDocs: docs/<route>.md + docs/images/ + mkdocs.yml; --site-url default "/"
bunx likec4 export techdocs -p my-project -o ./techdocs --site-url https://c4.acme.dev src/likec4

# portable bundle: <route>.md + images/ + manifest.json; --site-url optional
bunx likec4 export markdown-bundle -p my-project -o ./bundle [--site-url https://c4.acme.dev] src/likec4
```

Shared flags: `--project` (`-p`), `--outdir` (`-o`, `--output`, **required**). techdocs/markdown-bundle also take `--site-url`.

In techdocs/bundle, ` ```likec4-view ` → static image (+ interactive link to `<site-url>/view/<id>`); techdocs rewrites `mermaid`/links, bundle leaves `mermaid` as fenced blocks. Platform-neutral: LikeC4 holds no tokens — Confluence delivery lives in user CI via a third-party publisher.

Note: `export markdown-bundle` is NOT `export markdown` (the latter emits a per-project `README.md`).
