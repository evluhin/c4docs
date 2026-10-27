import { nonNullable } from '@c4docs/likec4-core'
import { createContext, use } from 'react'
import type { TypedUIMessage, TypedUIMessages, UseChatReturn } from './useChat'

export const ChatContext = createContext<UseChatReturn>(null as any)

export function useChatContext() {
  return nonNullable(use(ChatContext), 'useChatContext: ChatProvider is not provided')
}

export type { TypedUIMessage, TypedUIMessages, UseChatReturn }
