---
'likec4': patch
---

Export the diagrams your docs reference as static SVG images for use in external documentation systems. The new `likec4 export image` command renders every view embedded or linked from a doc to an SVG file with a content-hashed name and writes an `images.json` manifest mapping each view id to its image. Re-running leaves unchanged views with stable file names, and views referenced with `dynamic: sequence` are exported as their sequence layout.
