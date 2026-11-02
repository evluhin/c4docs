import type { Link as LinkData } from '@c4docs/likec4-core'
import { docLinkHref } from '@c4docs/likec4-core/utils'
import { css, cx } from '@c4docs/likec4-styles/css'
import { styled } from '@c4docs/likec4-styles/jsx'
import { type BadgeProps, ActionIcon, Badge, CopyButton } from '@mantine/core'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { forwardRef } from 'react'
import { useDocsConfig } from '../context'
import { GithubIcon } from './GithubIcon'

const GITHUB_PREFIX = 'https://github.com/'

export const Link = forwardRef<HTMLDivElement, Omit<BadgeProps, 'children' | 'classNames'> & { value: LinkData }>(
  ({ value, className, ...props }, ref) => {
    const docsConfig = useDocsConfig()
    // An element/view's associated document is a relative `.md` link into the
    // project's docs dir. When docs are configured, resolve it to the in-app
    // `/docs/<route>/` route (root-absolute; `.md` stripped; trailing slash) so
    // clicking opens the rendered doc instead of being treated as view
    // navigation. `value.relative` is project-root-relative (includes the docs
    // dir); it is absent for links already relative to the root, so fall back to
    // `value.url`.
    const docHref = docsConfig
      ? docLinkHref({ relative: value.relative ?? value.url, docsDir: docsConfig.docsDir })
      : null
    // If the url is already a full url, use it as is.
    // Otherwise, it's a relative url and we need to make it absolute.
    const url = docHref
      ?? (value.url.includes('://') ? value.url : new window.URL(value.url, window.location.href).toString())
    let isGithub = url.startsWith(GITHUB_PREFIX)

    return (
      <Badge
        ref={ref}
        variant="default"
        radius="sm"
        size="sm"
        tt="none"
        leftSection={null}
        rightSection={
          <CopyButton value={url} timeout={1500}>
            {({ copy, copied }) => (
              <ActionIcon
                className={css({
                  opacity: copied ? '1' : '0.45',
                  transition: 'fast',
                  _hover: {
                    opacity: '1',
                  },
                })}
                tabIndex={-1}
                size={'20'}
                variant={copied ? 'light' : 'transparent'}
                color={copied ? 'teal' : 'gray'}
                data-active={copied}
                onClick={e => {
                  e.stopPropagation()
                  e.preventDefault()
                  copy()
                }}
              >
                {copied ? <IconCheck /> : <IconCopy stroke={2.5} />}
              </ActionIcon>
            )}
          </CopyButton>
        }
        {...props}
        className={cx(className, 'group')}
        classNames={{
          root: css({
            flexWrap: 'nowrap',
            minHeight: '[24px]',
            maxWidth: '[500px]',
            userSelect: 'all',
            pr: '0',
            backgroundColor: {
              base: 'transparent',
              _hover: {
                base: 'mantine.gray[1]',
                _dark: 'mantine.dark[5]',
              },
            },
          }),
          section: css({
            '&:is([data-position="left"])': {
              color: 'text.dimmed',
              userSelect: 'none',
              pointerEvents: 'none',
              _groupHover: {
                color: '[var(--badge-color)]',
                opacity: '0.7',
              },
            },
          }),
        }}
      >
        <styled.a
          href={url}
          target="_blank"
          style={{
            color: 'var(--badge-color)',
            cursor: 'pointer',
          }}
          css={{
            transition: 'fast',
            opacity: {
              base: '0.7',
              _hover: '1',
            },
            textDecoration: {
              base: 'none',
              _hover: 'underline',
            },
          }}>
          {!value.title && isGithub && (
            <GithubIcon
              height="12"
              width="12"
              style={{ verticalAlign: 'middle', marginRight: '4px' }} />
          )}
          {value.title ?? (isGithub ? url.replace(GITHUB_PREFIX, '') : url)}
        </styled.a>
      </Badge>
    )
  },
)
