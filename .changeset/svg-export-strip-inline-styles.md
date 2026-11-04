---
"@c4docs/likec4": patch
---

SVG images exported for docs (`export image` / `export techdocs`) are now dramatically smaller. Redundant inline styles are stripped from the generated SVG with no visual change, so a view that previously produced a ~30 MB file now exports to roughly 1 MB.
