import { readFileSync } from 'node:fs'
import k from 'tinyrainbow'
import type * as yargs from 'yargs'
import { createLikeC4Logger } from '../../logger'
import { pkg } from '../conf'
import { checkCompatibility, findSkillMd, parseSkillRange } from './resolve'

const skillCmd = (yargs: yargs.Argv) => {
  return yargs
    .command({
      command: 'skill',
      describe: 'Agent skill utilities',
      builder: y =>
        y.command({
          command: 'check',
          describe: 'Check installed agent skill is compatible with this likec4 version',
          builder: b =>
            b.options({
              skill: {
                string: true,
                desc: 'path to a SKILL.md to check (overrides auto-detect)',
                nargs: 1,
              },
            }),
          handler: args => {
            const logger = createLikeC4Logger('c4:skill')

            const skillPath = findSkillMd(process.cwd(), args.skill)
            if (skillPath === null) {
              logger.error(
                k.red('no SKILL.md found; pass --skill <path> to point at a materialized skill'),
              )
              process.exitCode = 1
              return
            }

            let contents: string
            try {
              contents = readFileSync(skillPath, 'utf-8')
            } catch (e) {
              logger.error(k.red(`failed to read ${skillPath}: ${e instanceof Error ? e.message : String(e)}`))
              process.exitCode = 1
              return
            }

            const parsed = parseSkillRange(contents)
            if ('error' in parsed) {
              logger.error(k.red(`${skillPath}: ${parsed.error}`))
              process.exitCode = 1
              return
            }

            const result = checkCompatibility(pkg.version, parsed.range)
            if (result.ok) {
              logger.info(k.green(`✓ ${result.message}`))
            } else {
              logger.error(k.red(`✗ ${result.message}`))
            }
            process.exitCode = result.ok ? 0 : 1
          },
        })
          .demandCommand(1, 'Please choose a subcommand: check'),
      handler: () => {},
    })
}

export default skillCmd
