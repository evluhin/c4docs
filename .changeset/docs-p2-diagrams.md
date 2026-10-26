---
'@likec4/core': patch
'@likec4/language-server': patch
'likec4': patch
---

Docs can now embed live diagrams and Mermaid charts. Add a `likec4-view` fenced block to a Markdown doc to embed an interactive diagram by `view` id, optionally setting `focus`, `dynamic`, `theme`, and `padding`. Add a `mermaid` fenced block to render a Mermaid chart inline. References are resolved against your model at build time, and unresolved references (unknown view id, unknown focus element, or a malformed directive) are reported without breaking the build.

A view's diagram page now shows a "Referenced in docs" control listing the docs that embed or link to that view, so you can jump straight from a diagram to the documentation that uses it.

Doc links to pages whose names contain spaces now resolve correctly: route paths are encoded per segment so a page under a folder like `unified token` opens as expected, and the `.md` extension no longer leaks into the URL.
