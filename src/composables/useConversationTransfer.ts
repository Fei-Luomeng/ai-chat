import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { ElMessage } from 'element-plus'

import type { ChatMessage, ChatSession } from '@/stores/chat'

interface ConversationTransferOptions {
  activeProject: Ref<string>
  activeProjectSessionId: Ref<string>
  activeSession: ComputedRef<ChatSession | undefined>
  chatSessions: ChatSession[]
  createId: () => string
  currentMode: Ref<'chat' | 'project'>
  getMessagePlainText: (message: ChatMessage) => string
  isPendingNewSession: Ref<boolean>
  isPendingProjectSession: Ref<boolean>
  isProjectHome: Ref<boolean>
  persistChatSessions: () => void
  scrollToBottom: () => Promise<void>
  stopResponding: () => void
  switchSession: (sessionId: string) => void
}

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(timestamp)

const getMessageBranchLabel = (message: ChatMessage, index: number, messages: ChatMessage[]) => {
  // 助手消息沿用上一条用户消息的分支标签，导出时保持一轮问答一致。
  if (message.branchLabel) return message.branchLabel
  const previousMessage = messages[index - 1]
  return message.role === 'assistant' && previousMessage?.role === 'user'
    ? previousMessage.branchLabel ?? ''
    : ''
}

const getSafeFileName = (value: string) =>
  // 替换主流文件系统不允许的字符，并限制文件名长度。
  (value || 'AI Chat 对话')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48) || 'AI Chat 对话'

export const useConversationTransfer = (options: ConversationTransferOptions) => {
  // 导出选择只属于弹窗临时状态，不需要写入 localStorage。
  const isExportOpen = ref(false)
  const exportMode = ref<'all' | 'selected'>('all')
  const selectedExportMessageIds = ref<string[]>([])
  const exportableMessages = computed(() => options.activeSession.value?.messages ?? [])
  const selectedExportMessages = computed(() =>
    exportableMessages.value.filter((message) => selectedExportMessageIds.value.includes(message.id)),
  )

  const openExportDialog = () => {
    const session = options.activeSession.value
    if (!session?.messages.length) {
      ElMessage.warning('当前没有可导出的对话')
      return
    }
    // 每次打开默认全选，切到“选择消息”后可直接取消不需要的条目。
    exportMode.value = 'all'
    selectedExportMessageIds.value = session.messages.map((message) => message.id)
    isExportOpen.value = true
  }

  const closeExportDialog = () => {
    isExportOpen.value = false
  }

  const toggleExportMessage = (messageId: string) => {
    selectedExportMessageIds.value = selectedExportMessageIds.value.includes(messageId)
      ? selectedExportMessageIds.value.filter((id) => id !== messageId)
      : [...selectedExportMessageIds.value, messageId]
  }

  const getExportMessagePreview = (message: ChatMessage) => {
    const preview = options.getMessagePlainText(message).trim().replace(/\s+/g, ' ')
    return preview.length > 72 ? `${preview.slice(0, 72)}...` : preview || '(空消息)'
  }

  const exportCurrentSession = () => {
    const session = options.activeSession.value
    if (!session) return
    const messages = exportMode.value === 'all' ? session.messages : selectedExportMessages.value
    if (!messages.length) {
      ElMessage.warning('请至少选择一条消息')
      return
    }

    const exportedAt = new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(Date.now())
    // 使用可读 Markdown 协议，既能人工查看，也能被本应用重新导入。
    const lines = [
      `# ${session.title}`,
      '',
      `导出时间：${exportedAt}`,
      '',
      exportMode.value === 'selected' ? `导出范围：已选择 ${messages.length} 条消息` : '导出范围：全部对话',
      '',
      ...messages.flatMap((message, index) => {
        const branchLabel = getMessageBranchLabel(message, index, messages)
        return [
          `## ${message.role === 'assistant' ? 'AI Chat' : '你'}${branchLabel ? ` · ${branchLabel}` : ''} · ${formatTime(message.createdAt)}`,
          '',
          options.getMessagePlainText(message).trim() || '(空消息)',
          '',
        ]
      }),
    ]
    // Object URL 只在本次下载期间存在，触发后立即释放。
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${getSafeFileName(session.title)}.md`
    link.click()
    URL.revokeObjectURL(url)
    closeExportDialog()
    ElMessage.success('已导出对话')
  }

  const parseImportedMarkdown = (content: string) => {
    // 导入器只承诺解析本应用导出的标题结构，避免猜测任意 Markdown 的角色边界。
    const lines = content.replace(/\r\n/g, '\n').split('\n')
    const title = lines.find((line) => line.startsWith('# '))?.replace(/^#\s+/, '').trim() || '导入的对话'
    const messages: ChatMessage[] = []
    let currentRole: ChatMessage['role'] | null = null
    let currentBranchLabel = ''
    let currentContent: string[] = []

    const flushMessage = () => {
      // 遇到下一条角色标题时，把之前积累的正文提交为一条消息。
      if (!currentRole) return
      const messageContent = currentContent.join('\n').trim()
      if (!messageContent) return
      messages.push({
        branchLabel: currentRole === 'user' ? currentBranchLabel || undefined : undefined,
        id: options.createId(),
        role: currentRole,
        content: messageContent,
        createdAt: Date.now() + messages.length,
      })
    }

    lines.forEach((line) => {
      // 角色标题是导入协议边界，正文中的普通二级标题不会匹配该格式。
      const headingMatch = line.match(/^##\s+(你|AI Chat)(?:\s+·\s*(分支\s+\d+))?(?:\s+·.*)?$/)
      if (headingMatch) {
        flushMessage()
        currentRole = headingMatch[1] === '你' ? 'user' : 'assistant'
        currentBranchLabel = currentRole === 'user' ? headingMatch[2] ?? '' : ''
        currentContent = []
      } else if (currentRole) {
        currentContent.push(line)
      }
    })
    flushMessage()
    return { messages, title }
  }

  const importMarkdownSession = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    // 先清空 input，用户连续选择同一个文件时仍会触发 change。
    input.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.md')) {
      ElMessage.warning('请选择 Markdown 文件')
      return
    }

    const parsed = parseImportedMarkdown(await file.text())
    if (!parsed.messages.length) {
      ElMessage.warning('没有识别到可导入的消息')
      return
    }

    const session: ChatSession = {
      id: options.createId(),
      title: parsed.title,
      messages: parsed.messages,
      updatedAt: Date.now(),
    }
    // 导入始终创建普通会话，并退出可能残留的项目导航状态。
    options.stopResponding()
    options.chatSessions.unshift(session)
    options.switchSession(session.id)
    options.currentMode.value = 'chat'
    options.activeProject.value = ''
    options.activeProjectSessionId.value = ''
    options.isProjectHome.value = false
    options.isPendingNewSession.value = false
    options.isPendingProjectSession.value = false
    options.persistChatSessions()
    await options.scrollToBottom()
    ElMessage.success('已导入 Markdown 对话')
  }

  return {
    closeExportDialog,
    exportCurrentSession,
    exportMode,
    exportableMessages,
    getExportMessagePreview,
    importMarkdownSession,
    isExportOpen,
    openExportDialog,
    selectedExportMessageIds,
    selectedExportMessages,
    toggleExportMessage,
  }
}
