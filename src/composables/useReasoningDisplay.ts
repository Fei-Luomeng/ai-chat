import { ref, type ComputedRef, type Ref } from 'vue'

import { splitReasoningFromAnswer, stripFinalAnswerMarker, type ChatMessage } from '@/stores/chat'

interface ReasoningDisplayOptions {
  // 普通会话和项目会话已在外层适配为统一流式字段。
  isResponding: ComputedRef<boolean>
  liveNow: Ref<number>
  streamingMessageId: ComputedRef<string>
  streamingReasoningContent: ComputedRef<string>
  streamingReasoningEndedAt: ComputedRef<number>
  streamingReasoningStartedAt: ComputedRef<number>
}

export const useReasoningDisplay = (options: ReasoningDisplayOptions) => {
  // 这里只保存用户的折叠选择，思考内容仍以消息和流式状态为准。
  // 对象键是 messageId，值 true 表示该消息的思考区已折叠。
  const collapsedReasoning = ref<Record<string, boolean>>({})

  const getReasoningContent = (message: ChatMessage) => {
    // 正在生成的消息优先读取流式缓存，历史消息读取已持久化字段。
    if (message.id === options.streamingMessageId.value) {
      return options.streamingReasoningContent.value || message.reasoningContent || ''
    }
    // ?? 从左到右选择第一个不是 null/undefined 的值；
    // 与 || 不同，合法的空字符串不会因为是假值而自动跳到右侧。
    return message.reasoningContent ?? splitReasoningFromAnswer(message.content)?.reasoning ?? ''
  }

  const getAnswerContent = (message: ChatMessage) => {
    // 有独立 reasoning 字段时正文可直接使用，否则尝试从混合文本拆分。
    // 新消息有独立 reasoningContent；旧消息可能仍把思考和正文混在 content 中。
    if (message.reasoningContent) return stripFinalAnswerMarker(message.content)
    return stripFinalAnswerMarker(splitReasoningFromAnswer(message.content)?.answer ?? message.content)
  }

  const getReasoningStartedAt = (message: ChatMessage) => {
    // 当前流式消息优先取实时值，历史消息只读取持久化时间。
    if (message.id === options.streamingMessageId.value) {
      return options.streamingReasoningStartedAt.value || message.reasoningStartedAt || message.createdAt || 0
    }
    return message.reasoningStartedAt ?? 0
  }

  const getReasoningEndedAt = (message: ChatMessage) => {
    // 结束时间为 0 表示仍在思考或接口未提供时间信息。
    if (message.id === options.streamingMessageId.value) {
      return options.streamingReasoningEndedAt.value || message.reasoningEndedAt || 0
    }
    return message.reasoningEndedAt ?? 0
  }

  const getReasoningDuration = (message: ChatMessage) => {
    const startedAt = getReasoningStartedAt(message)
    const endedAt = getReasoningEndedAt(message)
    const liveEndedAt =
      // 正在生成时用每秒刷新的 liveNow 作为临时结束时间。
      message.id === options.streamingMessageId.value && options.isResponding.value ? options.liveNow.value : 0

    // 已结束使用真实 endedAt，正在生成使用持续更新的 liveEndedAt。
    if (startedAt && (endedAt || liveEndedAt)) {
      // 最短显示 1 秒，避免极快响应出现“0 秒”。
      return `${Math.max(1, Math.round(((endedAt || liveEndedAt) - startedAt) / 1000))} 秒`
    }

    if (!startedAt) {
      // 旧消息没有时间戳时按文本长度给出近似值，仅用于展示。
      const fallbackReasoning = !message.reasoningContent
        ? splitReasoningFromAnswer(message.content)?.reasoning
        : ''
      if (!fallbackReasoning) return ''
      return `${Math.max(1, Math.min(30, Math.round(fallbackReasoning.length / 120)))} 秒`
    }

    return ''
  }

  // 未记录的键是 undefined，undefined !== true，因此新消息默认展开。
  const isReasoningOpen = (messageId: string) => collapsedReasoning.value[messageId] !== true

  const toggleReasoning = (messageId: string) => {
    // Map 保存的是 collapsed 状态，因此写入切换前的 open 值。
    collapsedReasoning.value = {
      // ...保留其他消息的折叠状态，[messageId] 只覆盖当前消息对应的动态键。
      ...collapsedReasoning.value,
      // 当前若为展开，点击后把 collapsed 写成 true；反之写成 false。
      [messageId]: isReasoningOpen(messageId),
    }
  }

  const getReasoningLabel = (message: ChatMessage) => {
    // 只有当前流式消息且没有结束时间时显示“思考中”。
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

  // 模板只需要内容、标签和折叠控制，不暴露内部时间辅助函数。
  return {
    getAnswerContent,
    getReasoningContent,
    getReasoningLabel,
    isReasoningOpen,
    toggleReasoning,
  }
}
