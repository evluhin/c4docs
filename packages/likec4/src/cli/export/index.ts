import { pipe } from 'remeda'
import k from 'tinyrainbow'
import type * as yargs from 'yargs'
import { drawioCmd } from './drawio/handler'
import { imageCmd } from './image/handler'
import { jpgCmd } from './jpg/handler'
import { jsonCmd } from './json/handler'
import { markdownBundleCmd } from './markdown-bundle/handler'
import { markdownCmd } from './markdown/handler'
import { pngCmd } from './png/handler'
import { techdocsCmd } from './techdocs/handler'

/**
 * Registers the `export` command with subcommands png, jpg, json, drawio, markdown, markdown-bundle, image, techdocs.
 * @param yargs - yargs instance to extend
 * @returns yargs chain with export <format> [path] and format-specific options
 */
const exportCmd = (yargs: yargs.Argv) => {
  return yargs
    .command({
      command: 'export <format> [path]',
      describe:
        'Export to images, JSON, DrawIO, Markdown, a portable Markdown bundle, doc-referenced SVG images, or TechDocs',
      builder: yargs =>
        pipe(
          yargs.usage(`${k.bold('Usage:')} $0 export <format> [path]`),
          pngCmd,
          jpgCmd,
          jsonCmd,
          drawioCmd,
          markdownCmd,
          markdownBundleCmd,
          imageCmd,
          techdocsCmd,
        )
          .updateStrings({
            'Commands:': k.bold('Formats:'),
          }),
      handler: () => void 0,
    })
}

export default exportCmd
