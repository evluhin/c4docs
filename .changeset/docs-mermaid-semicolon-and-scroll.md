---
"@c4docs/likec4": patch
---

Docs: more Mermaid diagrams now render, and navigating between docs scrolls back to the top.

- Mermaid sequence diagrams that use a semicolon inside message or note text now render instead of failing with "Failed to render Mermaid diagram". Notes with line breaks (`<br/>`), `rect` background blocks, and `alt`/`else` blocks continue to render as expected.
- Opening a different doc from the navigation tree now scrolls the page back to the top so the new doc's header is visible, while in-page heading anchor links still jump to the linked heading.
