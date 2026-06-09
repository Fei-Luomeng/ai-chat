import { computed, nextTick, type ComputedRef } from 'vue'

import type { ChatMessage, ChatSession } from '@/stores/chat'

interface BranchVariant {
  id: string
  messages: ChatMessage[]
}

interface BranchGroup {
  sourceId: string
  variants: BranchVariant[]
}

interface MessageBranchesOptions {
  activeSession: ComputedRef<ChatSession | undefined>
  isProjectMode: ComputedRef<boolean>
  persistAppState: () => void
  persistChatSessions: () => void
  updateActiveMessageFromScroll: () => void
}

const getTurnMessages = (messages: ChatMessage[], userIndex: number): ChatMessage[] => {
  const firstMessage = messages[userIndex]
  if (!firstMessage) return []
  const turn = [firstMessage]

  for (let index = userIndex + 1; index < messages.length; index += 1) {
    const message = messages[index]
    if (!message || message.role === 'user') break
    turn.push(message)
  }
  return turn
}

export const useMessageBranches = (options: MessageBranchesOptions) => {
  const branchGroups = computed<BranchGroup[]>(() => {
    const messages = options.activeSession.value?.messages ?? []
    return messages.flatMap((sourceMessage, sourceIndex) => {
      if (sourceMessage.role !== 'user' || sourceMessage.branchOf) return []
      const branchMessages = messages.filter(
        (message) => message.role === 'user' && message.branchOf === sourceMessage.id,
      )
      if (!branchMessages.length) return []

      return [{
        sourceId: sourceMessage.id,
        variants: [
          { id: sourceMessage.id, messages: getTurnMessages(messages, sourceIndex) },
          ...branchMessages.map((branchMessage) => ({
            id: branchMessage.id,
            messages: getTurnMessages(
              messages,
              messages.findIndex((message) => message.id === branchMessage.id),
            ),
          })),
        ],
      }]
    })
  })

  const branchGroupBySource = computed(() =>
    new Map(branchGroups.value.map((group) => [group.sourceId, group])),
  )

  const selectedBranchId = (group: BranchGroup) => {
    const selectedId = options.activeSession.value?.activeBranchIds?.[group.sourceId]
    return group.variants.some((variant) => variant.id === selectedId)
      ? selectedId!
      : group.variants.at(-1)?.id ?? group.sourceId
  }

  const visibleMessages = computed(() => {
    const messages = options.activeSession.value?.messages ?? []
    const groupedMessageIds = new Set(
      branchGroups.value.flatMap((group) =>
        group.variants.flatMap((variant) => variant.messages.map((message) => message.id)),
      ),
    )
    const visible: ChatMessage[] = []

    messages.forEach((message) => {
      const group = branchGroupBySource.value.get(message.id)
      if (group) {
        const activeVariant = group.variants.find((variant) => variant.id === selectedBranchId(group))
        if (activeVariant) visible.push(...activeVariant.messages)
        return
      }
      if (!groupedMessageIds.has(message.id)) visible.push(message)
    })
    return visible
  })

  const getBranchSwitcher = (message: ChatMessage) => {
    if (message.role !== 'user') return null
    const sourceId = message.branchOf ?? message.id
    const group = branchGroupBySource.value.get(sourceId)
    if (!group) return null
    const index = group.variants.findIndex((variant) => variant.id === message.id)
    return index < 0 ? null : { index, sourceId, total: group.variants.length }
  }

  const selectBranch = (sourceId: string, nextIndex: number) => {
    const session = options.activeSession.value
    const variant = branchGroupBySource.value.get(sourceId)?.variants[nextIndex]
    if (!session || !variant) return

    session.activeBranchIds = { ...(session.activeBranchIds ?? {}), [sourceId]: variant.id }
    session.updatedAt = Date.now()
    if (options.isProjectMode.value) options.persistAppState()
    else options.persistChatSessions()
    void nextTick(options.updateActiveMessageFromScroll)
  }

  const revealMessageBranch = (messageId: string) => {
    const session = options.activeSession.value
    if (!session) return

    for (const group of branchGroups.value) {
      const variant = group.variants.find((item) =>
        item.messages.some((message) => message.id === messageId),
      )
      if (!variant) continue
      session.activeBranchIds = { ...(session.activeBranchIds ?? {}), [group.sourceId]: variant.id }
      return
    }
  }

  return {
    getBranchSwitcher,
    revealMessageBranch,
    selectBranch,
    visibleMessages,
  }
}
