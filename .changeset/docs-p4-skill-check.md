---
'@c4docs/likec4': patch
---

New `likec4 skill check` command verifies that an installed agent skill is compatible with your `likec4` version: it reads the skill's declared `likec4` range and, on a mismatch, fails loudly with a non-zero exit and a message naming both the running version and the required range.
