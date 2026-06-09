import { ref, type ComputedRef, type Ref } from 'vue'

import { splitReasoningFromAnswer, stripFinalAnswerMarker, type ChatMessage } from '@/stores/chat'

interface ReasoningDisplayOptions {
  isResponding: ComputedRef<boolean>
  liveNow: Ref<number>
  streamingMessageId: ComputedRef<string>
  streamingReasoningContent: ComputedRef<string>
  streamingReasoningEndedAt: ComputedRef<number>
  streamingReasoningStartedAt: ComputedRef<number>
}

export const useReasoningDisplay = (options: ReasoningDisplayOptions) => {
  const collapsedReasoning = ref<Record<string, boolean>>({})

  const getReasoningContent = (message: ChatMessage) => {
    if (message.id === options.streamingMessageId.value) {
      return options.streamingReasoningContent.value || message.reasoningContent || ''
    }
    return message.reasoningContent ?? splitReasoningFromAnswer(message.content)?.reasoning ?? ''
  }

  const getAnswerContent = (message: ChatMessage) => {
    if (message.reasoningContent) return stripFinalAnswerMarker(message.content)
    return stripFinalAnswerMarker(splitReasoningFromAnswer(message.content)?.answer ?? message.content)
  }

  const getReasoningStartedAt = (message: ChatMessage) => {
    if (message.id === options.streamingMessageId.value) {
      return options.streamingReasoningStartedAt.value || message.reasoningStartedAt || message.createdAt || 0
    }
    return message.reasoningStartedAt ?? 0
  }

  const getReasoningEndedAt = (message: ChatMessage) => {
    if (message.id === options.streamingMessageId.value) {
      return options.streamingReasoningEndedAt.value || message.reasoningEndedAt || 0
    }
    return message.reasoningEndedAt ?? 0
  }

  const getReasoningDuration = (message: ChatMessage) => {
    const startedAt = getReasoningStartedAt(message)
    const endedAt = getReasoningEndedAt(message)
    const liveEndedAt =
      message.id === options.streamingMessageId.value && options.isResponding.value ? options.liveNow.value : 0

    if (startedAt && (endedAt || liveEndedAt)) {
      return `${Math.max(1, Math.round(((endedAt || liveEndedAt) - startedAt) / 1000))} 秒`
    }

    if (!startedAt) {
      const fallbackReasoning = !message.reasoningContent
        ? splitReasoningFromAnswer(message.content)?.reasoning
        : ''
      if (!fallbackReasoning) return ''
      return `${Math.max(1, Math.min(30, Math.round(fallbackReasoning.length / 120)))} 秒`
    }

    return ''
  }

  const isReasoningOpen = (messageId: string) => collapsedReasoning.value[messageId] !== true

  const toggleReasoning = (messageId: string) => {
    collapsedReasoning.value = {
      ...collapsedReasoning.value,
      [messageId]: isReasoningOpen(messageId),
    }
  }

  const getReasoningLabel = (message: ChatMessage) => {
    if (
      message.id === options.streamingMessageId.value &&
      options.isResponding.value &&
      !getReasoningEndedAt(message)
    ) {
      const duration = getReasoningDuration(message)
      return duration ? `思考中（用时 ${duration}）` : '思考中'
    }

    const duration = getReasoningDuration(message)
    return duration ? `已思考（用时 ${duration}）` : '已思考'
  }

  return {
    getAnswerContent,
    getReasoningContent,
    getReasoningLabel,
    isReasoningOpen,
    toggleReasoning,
  }
}
