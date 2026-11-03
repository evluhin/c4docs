---
"@c4docs/likec4": patch
---
Docs: images and other static assets referenced from Markdown docs via relative links now render in the dev server (`likec4 start`), matching the production build. Replacing a referenced asset on disk is served without restarting the dev server.
