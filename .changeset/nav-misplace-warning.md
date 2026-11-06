---
"@c4docs/likec4": patch
---

A `nav.yaml` (or `nav.yml`) placed in a docs subfolder is now reported with a warning. Navigation is only read from `nav.yaml` at the docs root, so a per-folder nav file was silently ignored before. The warning names the misplaced file and explains that navigation must live at the docs root.
