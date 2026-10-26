import defu from 'defu'
import rehypePrism from 'rehype-prism-plus/common'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import { remarkAlert } from 'remark-github-blockquote-alert'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

function parser() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkAlert)
    .use(remarkRehype, { allowDangerousHtml: true })
    // Reparse raw HTML (e.g. the docs modeling placeholders) into real hast nodes
    // so rehype-sanitize can allow-list them instead of dropping raw nodes.
    .use(rehypeRaw)
    .use(rehypePrism, { ignoreMissing: true })
    .use(
      rehypeSanitize,
      defu(
        {
          attributes: {
            '*': [
              'className',
            ],
            'div': [
              // Sanitizer-safe placeholders emitted by the docs modeling passes.
              // `data-likec4-view-embed` carries the embed index; `data-mermaid`
              // marks a block whose escaped source is the div's text child.
              // hast-util-sanitize expects the camelCased property name for
              // `data-*` attributes.
              'dataLikec4ViewEmbed',
              'dataMermaid',
            ],
            'svg': [
              'width',
              'height',
              'viewBox',
              'fill',
              'ariaHidden',
            ],
            'path': ['d', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin'],
          },
          tagNames: [
            'svg',
            'g',
            'path',
            'div',
          ],
          protocols: {
            src: ['data'],
          },
        },
        defaultSchema,
      ),
    )
    .use(rehypeStringify, {
      allowDangerousHtml: true,
    })
}

export function markdownToHtml(markdown: string): string {
  return ('' + parser().processSync(markdown)).trim()
}
