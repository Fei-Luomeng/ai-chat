import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { ElMessage } from 'element-plus'

import type { ChatMessage, ChatSession } from '@/stores/chat'

interface ConversationTransferOptions {
  // 导入会改变当前导航位置，所以除了会话数组，还要注入模式和活动 id 等 Ref。
  activeProject: Ref<string>
  activeProjectSessionId: Ref<string>
  // ComputedRef 的 `.value` 是计算结果；联合 undefined 表示当前可能还没有选中会话。
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
  // 助手消息自身可能没有 branchLabel，因此向前查看同一轮的用户消息。
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
    // 最多保留 48 个字符；处理后为空时再次使用默认名称。
    .slice(0, 48) || 'AI Chat 对话'

export const useConversationTransfer = (options: ConversationTransferOptions) => {
  // 导出选择只属于弹窗临时状态，不需要写入 localStorage。
  const isExportOpen = ref(false)
  // 字符串字面量联合让模式只能是 all 或 selected，写错单词会立即出现类型错误。
  const exportMode = ref<'all' | 'selected'>('all')
  // 空数组本身无法提供元素类型，所以用 `<string[]>` 明确以后只能放消息 id 字符串。
  const selectedExportMessageIds = ref<string[]>([])
  // activeSession 切换后，这个 computed 自动指向新会话的消息数组。
  // activeSession.value?.messages：没有会话时返回 undefined，而不是访问 messages 报错；
  // `?? []` 再把 null/undefined 换成空数组。注意它不会把 0、false、空字符串当成空值。
  const exportableMessages = computed(() => options.activeSession.value?.messages ?? [])
  // selectedExportMessages 不重复保存数据，只根据消息列表和 id 选择实时派生。
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
    // 已存在就用 filter 移除；不存在就通过展开运算符追加。
    // 两个分支都创建新数组，响应式依赖能明确收到变化。
    selectedExportMessageIds.value = selectedExportMessageIds.value.includes(messageId)
      ? selectedExportMessageIds.value.filter((id) => id !== messageId)
      : [...selectedExportMessageIds.value, messageId]
  }

  const getExportMessagePreview = (message: ChatMessage) => {
    // 将换行等连续空白压成一个空格，使列表摘要保持单行。
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
      // 展开运算符把每条消息生成的字符串数组平铺到最终 lines 数组中。
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
    // Blob 把内存中的字符串包装成浏览器可下载的文件内容。
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    // 创建临时 a 元素并触发 click，浏览器会按 download 文件名下载 Blob。
    const link = document.createElement('a')
    link.href = url
    link.download = `${getSafeFileName(session.title)}.md`
    link.click()
    // 下载触发后释放临时 URL，避免 Blob 长期占用内存。
    URL.revokeObjectURL(url)
    closeExportDialog()
    ElMessage.success('已导出对话')
  }

  const parseImportedMarkdown = (content: string) => {
    // 导入器只承诺解析本应用导出的标题结构，避免猜测任意 Markdown 的角色边界。
    const lines = content.replace(/\r\n/g, '\n').split('\n')
    const title = lines.find((line) => line.startsWith('# '))?.replace(/^#\s+/, '').trim() || '导入的对话'
    const messages: ChatMessage[] = []
    // 下面几个 let 组成一个逐行解析状态机，记录当前正在收集哪条消息。
    let currentRole: ChatMessage['role'] | null = null
    let currentBranchLabel = ''
    let currentContent: string[] = []

    // 闭包会持续访问 currentRole/currentContent 的最新值，用来提交当前正在解析的消息。
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
        // 加上数组长度，让同一批导入消息的时间戳仍按顺序递增。
        createdAt: Date.now() + messages.length,
      })
    }

    lines.forEach((line) => {
      // 角色标题是导入协议边界，正文中的普通二级标题不会匹配该格式。
      const headingMatch = line.match(/^##\s+(你|AI Chat)(?:\s+·\s*(分支\s+\d+))?(?:\s+·.*)?$/)
      // 匹配到下一条角色标题前，先提交上一条消息，再清空正文缓冲区。
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

    // File.text() 异步读取用户选择的本地文件，不需要自己创建 FileReader。
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
    // unshift 把新导入会话放在最近列表首位。
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

  // 解析函数保持内部私有，外部只能通过经过校验的导入入口使用它。
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
