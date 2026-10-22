# docs-as-code example

A minimal project that pairs a LikeC4 model with a `docs/` tree to exercise the
docs-as-code feature:

- `docs: { landing: true }` makes the documentation the default landing page.
- `docs/index.md` is the entry page and references a relative image.
- `docs/adr/` is a folder with its own `index.md` label/order override.

Used by the Phase-1 end-to-end test in `packages/likec4`.
