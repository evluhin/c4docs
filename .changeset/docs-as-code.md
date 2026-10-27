---
'@c4docs/likec4-config': patch
'@c4docs/likec4-core': patch
'@c4docs/likec4-language-server': patch
'@c4docs/likec4-language-services': patch
'@c4docs/likec4-vite-plugin': patch
'@c4docs/likec4': patch
---

Documentation-as-code: write Markdown docs alongside your `.c4` files and have LikeC4 build them into the site. Docs are discovered from a `docs/` folder (configurable), rendered with a tree navigation sidebar, and can be made the default landing page via the new optional `docs` project config block.

Links inside docs are resolved at build time: relative `.md` links between docs become in-app navigation, and `likec4://view/<id>` links open the referenced diagram (carrying `?focus` and `?dynamic`).

You can take full control of the navigation with an optional `docs/nav.yaml`: list pages and sections in the order and nesting you want, with custom labels, mkdocs-style. When present it defines the whole docs tree; any docs you leave out stay reachable by direct link but are hidden from the sidebar. Without it, docs keep ordering by convention.

The LikeC4 SDK gains `docsModel(projectId)`, which returns a project's documentation model (navigation tree, pages, and entry page).
