import { pipe } from 'remeda'
import k from 'tinyrainbow'
import type * as yargs from 'yargs'
import { drawioCmd } from './drawio/handler'
import { imageCmd } from './image/handler'
import { jpgCmd } from './jpg/handler'
import { jsonCmd } from './json/handler'
import { markdownCmd } from './markdown/handler'
import { pngCmd } from './png/handler'

/**
 * Registers the `export` command with subcommands png, jpg, json, drawio, markdown, image.
 * @param yargs - yargs instance to extend
 * @returns yargs chain with export <format> [path] and format-specific options
 */
const exportCmd = (yargs: yargs.Argv) => {
  return yargs
    .command({
      command: 'export <format> [path]',
      describe: 'Export to images, JSON, DrawIO, Markdown, or doc-referenced SVG images',
      builder: yargs =>
        pipe(
          yargs.usage(`${k.bold('Usage:')} $0 export <format> [path]`),
          pngCmd,
          jpgCmd,
          jsonCmd,
          drawioCmd,
          markdownCmd,
          imageCmd,
        )
          .updateStrings({
            'Commands:': k.bold('Formats:'),
          }),
      handler: () => void 0,
    })
}

export default exportCmd
