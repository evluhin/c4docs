---
'likec4': patch
---

Export the diagrams your docs reference as static SVG images for use in external documentation systems. The new `likec4 export image` command renders every view embedded or linked from a doc to an SVG file with a content-hashed name and writes an `images.json` manifest mapping each view id to its image. Re-running leaves unchanged views with stable file names, and views referenced with `dynamic: sequence` are exported as their sequence layout.

Publish your documentation to MkDocs or Backstage TechDocs with the new `likec4 export techdocs` command. It writes one Markdown page per doc plus a `mkdocs.yml` navigation, replacing each embedded view with its exported image and a link back to the interactive diagram, passing Mermaid diagrams through untouched, and rewriting inter-doc and `likec4://` links to their destinations. Use `--site-url` to point the interactive links at your hosted LikeC4 site.
