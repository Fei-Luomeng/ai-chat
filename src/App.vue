<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowRight,
  ChatDotRound,
  Close,
  Delete,
  EditPen,
  Folder,
  FolderOpened,
  MoreFilled,
  Moon,
  Plus,
  Promotion,
  Search,
  Setting,
  Sunny,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import MarkdownIt from 'markdown-it'

import {
  MISSING_FINAL_ANSWER,
  splitReasoningFromAnswer,
  stripFinalAnswerMarker,
  useChatStore,
  type ChatMessage,
  type ChatSession,
} from '@/stores/chat'

interface PersistedAppState {
  activeProject?: string
  avatarImage?: string
  profileName?: string
  projectDescriptions?: Record<string, string>
  projects?: string[]
  projectSessions?: Record<string, ChatSession[]>
  themeMode?: 'light' | 'dark'
}

const APP_STORAGE_KEY = 'ai-chat:app-state'
const TOOL_STATE_KEY = 'ai-chat:tool-state'
const TEXT_FILE_CHAR_LIMIT = 60000
const FILE_PARSE_SIZE_LIMIT = 20 * 1024 * 1024
const LEGACY_WELCOME_CONTENT = '你好，我是你的 AI 助手。可以帮你整理想法、写代码、润色文案，或者陪你拆解一个复杂问题。'

const normalizeMessages = (messages: ChatMessage[]) =>
  messages.filter(
    (message, index) =>
      !(index === 0 && message.role === 'assistant' && message.content === LEGACY_WELCOME_CONTENT) &&
      !(message.role === 'assistant' && !message.content.trim()),
  )

const normalizeProjectSessions = (sessions: Record<string, ChatSession[]>) =>
  Object.fromEntries(
    Object.entries(sessions).map(([projectName, items]) => [
      projectName,
      items.map((session) => ({
        ...session,
        messages: normalizeMessages(session.messages ?? []),
      })),
    ]),
  )

const readAppState = (): PersistedAppState => {
  try {
    if (!window.localStorage) return {}
    const stored = window.localStorage.getItem(APP_STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

const readToolState = () => {
  try {
    const stored = window.localStorage?.getItem(TOOL_STATE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

const chatStore = useChatStore()
const storedAppState = readAppState()
const storedToolState = readToolState()
const draft = ref('')
const messagesRef = ref<HTMLElement | null>(null)
const textFileInputRef = ref<HTMLInputElement | null>(null)
const isParsingFile = ref(false)
const isSidebarCollapsed = ref(false)
const isSearchOpen = ref(false)
const searchText = ref('')
const isProjectsOpen = ref(true)
const isRecentOpen = ref(true)
const isSettingsOpen = ref(false)
const activeProject = ref(storedAppState.activeProject ?? '')
const currentMode = ref<'chat' | 'project'>('chat')
const isProjectHome = ref(false)
const isPendingNewSession = ref(false)
const isPendingProjectSession = ref(false)
const activeProjectSessionId = ref('')
const isProjectResponding = ref(false)
const projectStreamingMessageContent = ref('')
const projectStreamingMessageId = ref('')
const projectStreamingReasoningContent = ref('')
const projectStreamingReasoningEndedAt = ref(0)
const projectStreamingReasoningStartedAt = ref(0)
const isDeepThinking = ref(false)
const isAgentMode = ref(Boolean(storedToolState.agentMode))
const isWebSearch = ref(Boolean(storedToolState.webSearch))
const liveNow = ref(Date.now())
const activeMessageId = ref('')
const collapsedReasoning = ref<Record<string, boolean>>({})
const hoveredNavigatorItem = ref<{ label: string; right: number; top: number } | null>(null)
const openActionMenu = ref('')
const actionMenuStyle = ref<Record<string, string>>({})
const actionDialog = ref<
  | { type: 'create-project'; value: string }
  | { type: 'rename-project'; projectName: string; value: string }
  | { type: 'delete-project'; projectName: string; value: string }
  | { type: 'rename-session'; sessionId: string; value: string }
  | { type: 'delete-session'; sessionId: string; value: string }
  | null
>(null)
const projectSessions = ref<Record<string, ChatSession[]>>({})
const projectDescriptions = ref<Record<string, string>>(storedAppState.projectDescriptions ?? {})
const profileName = ref(storedAppState.profileName ?? 'Feather Mask')
const profileAvatar = ref('FM')
const draftProfileName = ref(profileName.value)
const avatarImage = ref(storedAppState.avatarImage ?? '')
const themeMode = ref<'light' | 'dark'>(storedAppState.themeMode ?? 'light')
const draftThemeMode = ref<'light' | 'dark'>(themeMode.value)
let projectAbortController: AbortController | null = null
let liveTimer: number | undefined

const createId = () => crypto.randomUUID()
const summarizeTitle = (content: string) => {
  const normalized = content.trim().replace(/\s+/g, ' ')
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || '新的对话'
}

const getNavigatorLabel = (content: string, index: number) => {
  const normalized = content.trim().replace(/\s+/g, ' ')

  if (!normalized) return `对话 ${index + 1}`

  return normalized.length > 22 ? `${normalized.slice(0, 22)}...` : normalized
}

const getNavigatorFullLabel = (content: string, index: number) => {
  const normalized = content.trim().replace(/\s+/g, ' ')

  return normalized || `对话 ${index + 1}`
}

const activeProjectSession = computed(() => {
  if (!activeProject.value || !activeProjectSessionId.value) return undefined
  return projectSessions.value[activeProject.value]?.find((session) => session.id === activeProjectSessionId.value)
})

const activeSession = computed(() => activeProjectSession.value ?? chatStore.activeSession)
const hasDraft = computed(() => draft.value.trim().length > 0)
const isFreshSession = computed(
  () => isPendingNewSession.value || isPendingProjectSession.value || (activeSession.value?.messages.length ?? 0) === 0,
)
const isProjectMode = computed(() => currentMode.value === 'project' && Boolean(activeProject.value))
const isResponding = computed(() => chatStore.isResponding || isProjectResponding.value)
const isWaitingForFirstToken = computed(() => isResponding.value && activeSession.value?.messages.at(-1)?.role === 'user')
const streamingAssistantMessageId = computed(() => {
  return isProjectMode.value ? projectStreamingMessageId.value : chatStore.streamingMessageId
})
const streamingAssistantMessageContent = computed(() => {
  return isProjectMode.value ? projectStreamingMessageContent.value : chatStore.streamingMessageContent
})
const streamingReasoningContent = computed(() => {
  return isProjectMode.value ? projectStreamingReasoningContent.value : chatStore.streamingReasoningContent
})
const streamingReasoningEndedAt = computed(() => {
  return isProjectMode.value ? projectStreamingReasoningEndedAt.value : chatStore.streamingReasoningEndedAt
})
const streamingReasoningStartedAt = computed(() => {
  return isProjectMode.value ? projectStreamingReasoningStartedAt.value : chatStore.streamingReasoningStartedAt
})
const headerSessionTitle = computed(() => {
  if (isPendingNewSession.value || isPendingProjectSession.value) return '新的对话'
  return activeSession.value?.title ?? '新的对话'
})

const projects = ref<string[]>(storedAppState.projects ?? [])
projectSessions.value = normalizeProjectSessions(storedAppState.projectSessions ?? {})

const searchResults = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  if (!keyword) return []

  return chatStore.sessions.filter((session) => {
    const searchable = [
      session.title,
      ...session.messages.map((message) => message.content),
    ].join(' ').toLowerCase()

    return searchable.includes(keyword)
  })
})

const hasSearchQuery = computed(() => searchText.value.trim().length > 0)

const activeProjectSessions = computed(() => {
  if (!activeProject.value) return []

  return projectSessions.value[activeProject.value] ?? []
})

const messageNavigatorItems = computed(() =>
  (activeSession.value?.messages ?? [])
    .filter((message) => message.role === 'user')
    .map((message, index) => ({
      id: message.id,
      fullLabel: getNavigatorFullLabel(message.content, index),
      label: getNavigatorLabel(message.content, index),
      role: message.role,
    })),
)

const savedAvatarDisplay = computed(() => profileAvatar.value.trim().slice(0, 2).toUpperCase() || 'U')

const persistAppState = () => {
  const state: PersistedAppState = {
    activeProject: activeProject.value,
    avatarImage: avatarImage.value,
    profileName: profileName.value,
    projectDescriptions: projectDescriptions.value,
    projects: projects.value,
    projectSessions: projectSessions.value,
    themeMode: themeMode.value,
  }

  try {
    window.localStorage?.setItem(APP_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

const escapeHtml = (content: string) =>
  content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const isJavascriptLanguage = (lang: string) => ['javascript', 'typescript', 'js', 'ts'].includes(lang.toLowerCase())

const formatJavascriptCode = (code: string) => {
  const repaired = code
    .replace(/\bfunction([A-Za-z_$])/g, 'function $1')
    .replace(/\breturnfunction\b/g, 'return function')
    .replace(/\b(const|let|var)([A-Za-z_$])/g, '$1 $2')
    .replace(/\b(if|for|while|switch|catch)(?=\()/g, '$1 ')
    .replace(/,(?=\S)/g, ', ')
    .replace(/\/\/\s*/g, '\n// ')
    .replace(/\{/g, ' {\n')
    .replace(/;/g, ';\n')
    .replace(/\}/g, '\n}\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\n}\n;\n/g, '\n};\n')

  let depth = 0

  return repaired
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('}')) depth = Math.max(0, depth - 1)

      const formattedLine = `${'  '.repeat(depth)}${line}`

      if (line.endsWith('{')) depth += 1

      return formattedLine
    })
    .join('\n')
}

const formatCodeContent = (lang: string, code: string[]) => {
  const rawCode = code.join('\n').trimEnd()

  if (!isJavascriptLanguage(lang)) return rawCode

  return formatJavascriptCode(rawCode)
}

const renderCodeBlock = (lang: string, code: string[]) => [
  '<div class="code-card">',
  '<button class="code-copy" type="button" aria-label="复制代码"><span></span></button>',
  `<pre><code data-lang="${escapeHtml(lang)}">${escapeHtml(formatCodeContent(lang, code))}</code></pre>`,
  '</div>',
].join('')

const codeLanguages = [
  'javascript',
  'typescript',
  'python',
  'bash',
  'shell',
  'html',
  'json',
  'css',
  'vue',
  'js',
  'ts',
]

const normalizeMarkdownContent = (content: string) => {
  const languagePattern = codeLanguages.join('|')
  const gluedFence = new RegExp(`\`{3}(${languagePattern})(?=\\S)`, 'gi')
  const openingFence = new RegExp(`([^\\n])(\`{3}(?:${languagePattern})?(?:\\s|\\n|$))`, 'gi')

  return content
    .replace(gluedFence, '```$1\n')
    .replace(openingFence, '$1\n$2')
    .replace(/^\\(#{1,6}\s+)/gm, '$1')
    .replace(/^(#{1,6})\s+(#{1,6}\s+)/gm, '$2')
    .replace(/([。！？：:；;）)])\s*(#{1,6})(?=\S)/g, '$1\n\n$2')
    .replace(/^(#{1,6})(\S)/gm, '$1 $2')
}

const markdown = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
})

const defaultLinkOpen = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index]
  const targetIndex = token.attrIndex('target')
  const relIndex = token.attrIndex('rel')

  if (targetIndex < 0) token.attrPush(['target', '_blank'])
  else token.attrs![targetIndex][1] = '_blank'

  if (relIndex < 0) token.attrPush(['rel', 'noreferrer'])
  else token.attrs![relIndex][1] = 'noreferrer'

  return defaultLinkOpen ? defaultLinkOpen(tokens, index, options, env, self) : self.renderToken(tokens, index, options)
}

markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const lang = token.info.trim().split(/\s+/)[0] ?? ''

  return renderCodeBlock(lang, token.content.split('\n'))
}

markdown.renderer.rules.code_block = (tokens, index) => renderCodeBlock('', tokens[index].content.split('\n'))

markdown.core.ruler.after('inline', 'clean_repeated_heading_marks', (state) => {
  state.tokens.forEach((token, index) => {
    if (token.type !== 'inline' || state.tokens[index - 1]?.type !== 'heading_open') return

    token.content = token.content.replace(/^#{1,6}\s+/, '')
    token.children?.forEach((child) => {
      if (child.type === 'text') {
        child.content = child.content.replace(/^#{1,6}\s+/, '')
      }
    })
  })
})

const renderMarkdown = (content: string) => markdown.render(normalizeMarkdownContent(content))

const scrollToBottom = async () => {
  await nextTick()
  if (!messagesRef.value) return
  messagesRef.value.scrollTop = messagesRef.value.scrollHeight
}

const updateActiveMessageFromScroll = () => {
  if (!messagesRef.value) return

  const rows = Array.from(messagesRef.value.querySelectorAll<HTMLElement>('[data-message-role="user"]'))
  if (!rows.length) {
    activeMessageId.value = ''
    return
  }

  const marker = messagesRef.value.getBoundingClientRect().top + messagesRef.value.clientHeight * 0.42
  const current = rows.findLast((row) => row.getBoundingClientRect().top <= marker) ?? rows[0]
  activeMessageId.value = current?.dataset.messageId ?? ''
}

const jumpToMessage = async (messageId: string) => {
  await nextTick()
  const row = messagesRef.value?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`)
  if (!row) return

  row.scrollIntoView({ behavior: 'smooth', block: 'center' })
  activeMessageId.value = messageId
}

const copyRenderedCode = async (event: MouseEvent) => {
  const copyButton = (event.target as HTMLElement).closest<HTMLButtonElement>('.code-copy')
  if (!copyButton) return

  const code = copyButton.parentElement?.querySelector('code')?.textContent ?? ''
  if (!code) return

  await navigator.clipboard.writeText(code)
  ElMessage.success('已复制代码')
}

const getReasoningContent = (message: ChatMessage) => {
  if (message.id === streamingAssistantMessageId.value) {
    return streamingReasoningContent.value || message.reasoningContent || ''
  }

  return message.reasoningContent ?? splitReasoningFromAnswer(message.content)?.reasoning ?? ''
}

const getAnswerContent = (message: ChatMessage) => {
  if (message.reasoningContent) return stripFinalAnswerMarker(message.content)

  return stripFinalAnswerMarker(splitReasoningFromAnswer(message.content)?.answer ?? message.content)
}

const getReasoningStartedAt = (message: ChatMessage) => {
  if (message.id === streamingAssistantMessageId.value) {
    return streamingReasoningStartedAt.value || message.reasoningStartedAt || message.createdAt || 0
  }

  return message.reasoningStartedAt ?? 0
}

const getReasoningEndedAt = (message: ChatMessage) => {
  if (message.id === streamingAssistantMessageId.value) {
    return streamingReasoningEndedAt.value || message.reasoningEndedAt || 0
  }

  return message.reasoningEndedAt ?? 0
}

const getReasoningDuration = (message: ChatMessage) => {
  const startedAt = getReasoningStartedAt(message)
  const endedAt = getReasoningEndedAt(message)
  const liveEndedAt = message.id === streamingAssistantMessageId.value && isResponding.value ? liveNow.value : 0

  if (startedAt && (endedAt || liveEndedAt)) {
    return `${Math.max(1, Math.round(((endedAt || liveEndedAt) - startedAt) / 1000))} 秒`
  }

  if (!startedAt) {
    const fallbackReasoning = !message.reasoningContent ? splitReasoningFromAnswer(message.content)?.reasoning : ''
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
  if (message.id === streamingAssistantMessageId.value && isResponding.value && !getReasoningEndedAt(message)) {
    const duration = getReasoningDuration(message)
    return duration ? `思考中（用时 ${duration}）` : '思考中'
  }

  const duration = getReasoningDuration(message)
  if (duration) return `已思考（用时 ${duration}）`

  return '已思考'
}

const toggleDeepThinking = () => {
  isDeepThinking.value = !isDeepThinking.value
}

const toggleAgentMode = () => {
  isAgentMode.value = !isAgentMode.value
  persistToolState()
  if (import.meta.env.DEV) {
    console.info(`Agent mode toggled: ${isAgentMode.value}`)
  }
}

const toggleWebSearch = () => {
  isWebSearch.value = !isWebSearch.value
  persistToolState()
  if (import.meta.env.DEV) {
    console.info(`Web search toggled: ${isWebSearch.value}`)
  }
}

const persistToolState = () => {
  try {
    window.localStorage?.setItem(
      TOOL_STATE_KEY,
      JSON.stringify({
        agentMode: isAgentMode.value,
        webSearch: isWebSearch.value,
      }),
    )
  } catch {
    // Tool state persistence is best-effort only.
  }
}

const isToolButtonPressed = (tool: string) => {
  if (typeof document === 'undefined') return false

  return Boolean(document.querySelector(`.composer-tools button[data-tool="${tool}"][aria-pressed="true"]`))
}

const getSendOptions = () => ({
  agentMode: isAgentMode.value || isToolButtonPressed('agent-mode'),
  deepThinking: isDeepThinking.value || isToolButtonPressed('deep-thinking'),
  webSearch: isWebSearch.value || isToolButtonPressed('web-search'),
})

const getTextFileLanguage = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  const languageMap: Record<string, string> = {
    css: 'css',
    csv: 'csv',
    html: 'html',
    js: 'javascript',
    json: 'json',
    jsx: 'javascript',
    less: 'css',
    log: 'text',
    markdown: 'markdown',
    md: 'markdown',
    scss: 'css',
    ts: 'typescript',
    tsx: 'typescript',
    txt: 'text',
    vue: 'vue',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
  }

  return languageMap[extension] ?? 'text'
}

const getMarkdownFence = (content: string) => {
  let fence = '```'

  while (content.includes(fence)) {
    fence += '`'
  }

  return fence
}

const openTextFilePicker = () => {
  if (isParsingFile.value) return
  textFileInputRef.value?.click()
}

const appendRecognizedTextToDraft = (file: File, content: string) => {
  const trimmedContent = content.trim()
  const normalizedContent =
    trimmedContent.length > TEXT_FILE_CHAR_LIMIT
      ? `${trimmedContent.slice(0, TEXT_FILE_CHAR_LIMIT)}\n\n[内容过长，已截取前 ${TEXT_FILE_CHAR_LIMIT} 个字符]`
      : trimmedContent
  const language = getTextFileLanguage(file.name)
  const fence = getMarkdownFence(normalizedContent)
  const recognizedText = [
    `请基于下面这个文件解析结果进行分析。`,
    '',
    `文件名：${file.name}`,
    `文件大小：${Math.ceil(file.size / 1024)} KB`,
    `解析方式：智谱文件解析`,
    '',
    `${fence}${language}`,
    normalizedContent,
    fence,
  ].join('\n')
  const currentDraft = draft.value.trim()

  draft.value = currentDraft ? `${currentDraft}\n\n${recognizedText}` : recognizedText
}

const handleTextFileUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''

  if (!file) return

  if (file.size > FILE_PARSE_SIZE_LIMIT) {
    ElMessage.warning('文件太大了，当前文件解析先支持 20MB 以内的文件。')
    return
  }

  isParsingFile.value = true
  try {
    const content = await chatStore.parseFileContent(file)
    if (!content.trim()) {
      ElMessage.warning('没有识别到可用文本内容。')
      return
    }

    appendRecognizedTextToDraft(file, content)
    ElMessage.success(`文件解析完成：${file.name}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '文件解析失败，请稍后重试。'
    ElMessage.error(message)
  } finally {
    isParsingFile.value = false
  }
}

const showNavigatorTooltip = (
  item: { fullLabel: string },
  event: MouseEvent,
) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  hoveredNavigatorItem.value = {
    label: item.fullLabel,
    right: window.innerWidth - rect.left + 14,
    top: rect.top + rect.height / 2,
  }
}

const hideNavigatorTooltip = () => {
  hoveredNavigatorItem.value = null
}

watch(
  () => activeSession.value?.messages.length,
  () => {
    void scrollToBottom().then(updateActiveMessageFromScroll)
  },
)

watch(
  () => activeSession.value?.id,
  () => {
    void nextTick(updateActiveMessageFromScroll)
  },
)

watch(
  [projects, projectSessions, projectDescriptions, activeProject, profileName, avatarImage, themeMode],
  () => {
    persistAppState()
  },
  { deep: true },
)

watch(
  isResponding,
  (responding) => {
    if (responding) {
      liveNow.value = Date.now()
      if (liveTimer === undefined) {
        liveTimer = window.setInterval(() => {
          liveNow.value = Date.now()
        }, 1000)
      }
      return
    }

    liveNow.value = Date.now()
    if (liveTimer !== undefined) {
      window.clearInterval(liveTimer)
      liveTimer = undefined
    }
  },
  { immediate: true },
)

const createProjectSession = (projectName: string) => {
  const now = Date.now()
  const session: ChatSession = {
    id: `project-${createId()}`,
    title: '新的对话',
    messages: [],
    updatedAt: now,
  }

  projectSessions.value = {
    ...projectSessions.value,
    [projectName]: [session, ...(projectSessions.value[projectName] ?? [])],
  }
  activeProjectSessionId.value = session.id
  return session
}

const sendProjectContent = async (content: string, sendOptions = getSendOptions()) => {
  const session = activeProjectSession.value
  const trimmedContent = content.trim()
  if (!session || !trimmedContent || isProjectResponding.value) return

  const now = Date.now()
  session.messages.push({
    id: createId(),
    role: 'user',
    content: trimmedContent,
    createdAt: now,
  })

  if (session.messages.length === 1) {
    session.title = summarizeTitle(trimmedContent)
  }

  session.updatedAt = now
  isProjectResponding.value = true
  projectAbortController = new AbortController()

  persistAppState()

  let assistantMessage: ChatMessage | null = null
  let contentFallbackBuffer = ''
  let hasProviderReasoning = false
  const ensureProjectAssistantMessage = () => {
    if (!assistantMessage) {
      assistantMessage = {
        id: createId(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      }
      session.messages.push(assistantMessage)
      projectStreamingMessageId.value = assistantMessage.id
      projectStreamingMessageContent.value = ''
      projectStreamingReasoningContent.value = ''
      projectStreamingReasoningEndedAt.value = 0
      projectStreamingReasoningStartedAt.value = 0
    }

    return assistantMessage
  }

  const reply = await chatStore.requestAssistantReply(session.messages, {
    agentMode: sendOptions.agentMode,
    deepThinking: sendOptions.deepThinking,
    webSearch: sendOptions.webSearch,
    onReasoning: (token) => {
      hasProviderReasoning = true
      const message = ensureProjectAssistantMessage()
      const now = Date.now()
      if (!projectStreamingReasoningStartedAt.value) {
        projectStreamingReasoningStartedAt.value = now
        message.reasoningStartedAt = now
      }
      projectStreamingReasoningContent.value += token
      message.reasoningContent = projectStreamingReasoningContent.value
      session.updatedAt = now
    },
    onToken: (token) => {
      const message = ensureProjectAssistantMessage()
      if (sendOptions.deepThinking && !hasProviderReasoning) {
        const now = Date.now()
        contentFallbackBuffer += token

        if (!projectStreamingReasoningStartedAt.value) {
          projectStreamingReasoningStartedAt.value = message.createdAt || now
          message.reasoningStartedAt = projectStreamingReasoningStartedAt.value
        }

        const fallbackSplit = splitReasoningFromAnswer(contentFallbackBuffer)
        const directAnswer = stripFinalAnswerMarker(contentFallbackBuffer)
        const hasDirectAnswer = directAnswer !== contentFallbackBuffer.trimStart()

        if (hasDirectAnswer) {
          projectStreamingReasoningContent.value = ''
          projectStreamingReasoningEndedAt.value = 0
          projectStreamingReasoningStartedAt.value = 0
          projectStreamingMessageContent.value = directAnswer
          message.reasoningContent = undefined
          message.reasoningEndedAt = undefined
          message.reasoningStartedAt = undefined
          message.content = directAnswer
        } else if (fallbackSplit) {
          if (!projectStreamingReasoningEndedAt.value) {
            projectStreamingReasoningEndedAt.value = now
            message.reasoningEndedAt = now
          }
          projectStreamingReasoningContent.value = fallbackSplit.reasoning
          projectStreamingMessageContent.value = fallbackSplit.answer
          message.reasoningContent = fallbackSplit.reasoning
          message.content = fallbackSplit.answer
        } else {
          projectStreamingReasoningContent.value = contentFallbackBuffer
          projectStreamingMessageContent.value = ''
          message.reasoningContent = contentFallbackBuffer
          message.content = ''
        }

        session.updatedAt = now
        return
      }

      if (projectStreamingReasoningContent.value && !projectStreamingReasoningEndedAt.value) {
        projectStreamingReasoningEndedAt.value = Date.now()
        message.reasoningEndedAt = projectStreamingReasoningEndedAt.value
      }
      projectStreamingMessageContent.value += token
      session.updatedAt = Date.now()
    },
    signal: projectAbortController.signal,
    systemPrompt: [
      '你是 AI Chat，一个简洁、可靠的中文 AI 助手。回答要自然、清楚，优先解决用户当前问题。',
      `当前项目：${activeProject.value}`,
      projectDescriptions.value[activeProject.value] ? `项目说明：${projectDescriptions.value[activeProject.value]}` : '',
    ].filter(Boolean).join('\n'),
  })
  projectAbortController = null
  if (!isProjectResponding.value) return

  if (assistantMessage) {
    if (projectStreamingReasoningContent.value && !projectStreamingReasoningEndedAt.value) {
      projectStreamingReasoningEndedAt.value = Date.now()
    }
    let finalContent = projectStreamingMessageContent.value
    let finalReasoning = projectStreamingReasoningContent.value
    let reasoningStartedAt = projectStreamingReasoningStartedAt.value
    let reasoningEndedAt = projectStreamingReasoningEndedAt.value
    const fallbackSource = contentFallbackBuffer || finalContent
    const fallbackSplit =
      sendOptions.deepThinking && !hasProviderReasoning ? splitReasoningFromAnswer(fallbackSource) : null
    const directAnswer =
      sendOptions.deepThinking && !hasProviderReasoning && contentFallbackBuffer ? stripFinalAnswerMarker(contentFallbackBuffer) : ''
    const hasDirectAnswer = Boolean(directAnswer && directAnswer !== contentFallbackBuffer.trimStart())

    if (hasDirectAnswer) {
      finalContent = directAnswer
      finalReasoning = ''
      reasoningStartedAt = 0
      reasoningEndedAt = 0
    } else if (fallbackSplit) {
      finalContent = fallbackSplit.answer
      finalReasoning = fallbackSplit.reasoning
      reasoningStartedAt = assistantMessage.createdAt
      reasoningEndedAt = Date.now()
    } else if (sendOptions.deepThinking && !hasProviderReasoning && contentFallbackBuffer) {
      finalContent = contentFallbackBuffer
      finalReasoning = ''
      reasoningStartedAt = 0
      reasoningEndedAt = 0
    }

    const reasoningAnswerSplit = finalReasoning.trim() && !finalContent.trim()
      ? splitReasoningFromAnswer(finalReasoning)
      : null

    if (reasoningAnswerSplit) {
      finalContent = reasoningAnswerSplit.answer
      finalReasoning = reasoningAnswerSplit.reasoning
      reasoningStartedAt = reasoningStartedAt || assistantMessage.createdAt
      reasoningEndedAt = reasoningEndedAt || Date.now()
    } else if (finalReasoning.trim() && !finalContent.trim()) {
      finalContent = MISSING_FINAL_ANSWER
    }

    assistantMessage.content = finalContent
    assistantMessage.reasoningContent = finalReasoning || undefined
    assistantMessage.reasoningStartedAt = reasoningStartedAt || undefined
    assistantMessage.reasoningEndedAt = reasoningEndedAt || undefined
  } else if (reply) {
    const fallbackSplit = sendOptions.deepThinking ? splitReasoningFromAnswer(reply) : null
    const createdAt = Date.now()
    assistantMessage = {
      id: createId(),
      role: 'assistant',
      content: fallbackSplit?.answer ?? reply,
      reasoningContent: fallbackSplit?.reasoning,
      reasoningEndedAt: fallbackSplit ? createdAt : undefined,
      reasoningStartedAt: fallbackSplit ? createdAt : undefined,
      createdAt,
    }
    session.messages.push(assistantMessage)
  }
  session.updatedAt = Date.now()
  isProjectResponding.value = false
  projectStreamingMessageContent.value = ''
  projectStreamingMessageId.value = ''
  projectStreamingReasoningContent.value = ''
  projectStreamingReasoningEndedAt.value = 0
  projectStreamingReasoningStartedAt.value = 0
  persistAppState()
}

const send = async () => {
  if (!hasDraft.value) return

  const content = draft.value
  const sendOptions = getSendOptions()
  draft.value = ''

  if (isPendingNewSession.value) {
    chatStore.createSession()
    isPendingNewSession.value = false
  }

  if (isPendingProjectSession.value && activeProject.value) {
    createProjectSession(activeProject.value)
    isPendingProjectSession.value = false
    await sendProjectContent(content, sendOptions)
    return
  }

  if (activeProjectSession.value) {
    await sendProjectContent(content, sendOptions)
    return
  }

  await chatStore.sendMessage(content, sendOptions)
}

const restoreInterruptedDraft = () => {
  const session = activeSession.value
  if (!session) return

  let lastMessage = session.messages.at(-1)
  if (lastMessage?.role === 'assistant') {
    session.messages.pop()
    lastMessage = session.messages.at(-1)
  }

  if (lastMessage?.role !== 'user') return

  draft.value = lastMessage.content
  session.messages.pop()

  if (session.messages.length <= 1) {
    session.title = '新的对话'
  }
  session.updatedAt = Date.now()
  persistAppState()
}

const stopResponding = () => {
  restoreInterruptedDraft()
  chatStore.stopResponding()
  projectAbortController?.abort()
  projectAbortController = null
  isProjectResponding.value = false
  projectStreamingMessageContent.value = ''
  projectStreamingMessageId.value = ''
  projectStreamingReasoningContent.value = ''
  projectStreamingReasoningEndedAt.value = 0
  projectStreamingReasoningStartedAt.value = 0
  ElMessage.info('已终止生成')
}

const openSearch = async () => {
  isSearchOpen.value = true
  await nextTick()
  document.querySelector<HTMLInputElement>('.search-dialog input')?.focus()
}

const closeSearch = () => {
  isSearchOpen.value = false
  searchText.value = ''
}

const switchFromSearch = (session: ChatSession) => {
  chatStore.stopResponding()
  chatStore.switchSession(session.id)
  currentMode.value = 'chat'
  activeProject.value = ''
  activeProjectSessionId.value = ''
  isProjectHome.value = false
  isPendingNewSession.value = false
  isPendingProjectSession.value = false
  closeSearch()
  void scrollToBottom()
}

const getResultPreview = (session: ChatSession) => {
  const message = [...session.messages].reverse().find((item) => item.role === 'user') ?? session.messages.at(-1)
  return message?.content ?? '暂无消息'
}

const highlightParts = (content: string) => {
  const keyword = searchText.value.trim()
  if (!keyword) return [{ text: content, hit: false }]

  const lowerContent = content.toLowerCase()
  const lowerKeyword = keyword.toLowerCase()
  const parts: Array<{ text: string; hit: boolean }> = []
  let cursor = 0
  let index = lowerContent.indexOf(lowerKeyword)

  while (index !== -1) {
    if (index > cursor) {
      parts.push({ text: content.slice(cursor, index), hit: false })
    }

    parts.push({ text: content.slice(index, index + keyword.length), hit: true })
    cursor = index + keyword.length
    index = lowerContent.indexOf(lowerKeyword, cursor)
  }

  if (cursor < content.length) {
    parts.push({ text: content.slice(cursor), hit: false })
  }

  return parts
}

const createSession = () => {
  chatStore.stopResponding()
  draft.value = ''
  isDeepThinking.value = false
  isAgentMode.value = false
  isWebSearch.value = false
  persistToolState()
  currentMode.value = 'chat'
  activeProject.value = ''
  activeProjectSessionId.value = ''
  isProjectHome.value = false
  isPendingNewSession.value = true
  isPendingProjectSession.value = false
  openActionMenu.value = ''
}

const selectProject = (projectName: string) => {
  activeProject.value = projectName
  isDeepThinking.value = false
  isAgentMode.value = false
  isWebSearch.value = false
  persistToolState()
  currentMode.value = 'project'
  isProjectHome.value = true
  activeProjectSessionId.value = ''
  isPendingNewSession.value = false
  isPendingProjectSession.value = false
  isProjectsOpen.value = true
  openActionMenu.value = ''
}

const switchProjectSession = (sessionId: string) => {
  activeProjectSessionId.value = sessionId
  currentMode.value = 'project'
  isProjectHome.value = false
  isPendingNewSession.value = false
  isPendingProjectSession.value = false
  openActionMenu.value = ''
  void scrollToBottom()
}

const sendProjectMessage = async () => {
  if (!activeProject.value) return

  const content = draft.value.trim()
  if (!content) return
  const sendOptions = getSendOptions()

  createProjectSession(activeProject.value)
  currentMode.value = 'project'
  isProjectHome.value = false
  isPendingNewSession.value = false
  isPendingProjectSession.value = false

  draft.value = ''
  await sendProjectContent(content, sendOptions)
}

const toggleActionMenu = (menuId: string, event?: MouseEvent) => {
  if (openActionMenu.value === menuId) {
    openActionMenu.value = ''
    return
  }

  openActionMenu.value = menuId
  const target = event?.currentTarget as HTMLElement | undefined
  const rect = target?.getBoundingClientRect()
  if (rect) {
    actionMenuStyle.value = {
      left: `${rect.right + 18}px`,
      top: `${rect.bottom + 8}px`,
    }
  }
}

const openCreateProjectDialog = () => {
  actionDialog.value = { type: 'create-project', value: '' }
  openActionMenu.value = ''
}

const applyCreateProject = (name: string) => {
  const projectName = name.trim()
  if (!projectName) return

  const nextName = projects.value.includes(projectName)
    ? `${projectName} ${projects.value.filter((item) => item.startsWith(projectName)).length + 1}`
    : projectName

  projects.value = [nextName, ...projects.value]
  projectSessions.value = {
    ...projectSessions.value,
    [nextName]: [],
  }
  projectDescriptions.value = {
    ...projectDescriptions.value,
    [nextName]: '',
  }
  selectProject(nextName)
}

const renameProject = (projectName: string) => {
  actionDialog.value = { type: 'rename-project', projectName, value: projectName }
  openActionMenu.value = ''
}

const applyRenameProject = (projectName: string, name: string) => {
  const nextName = name.trim()
  if (!nextName || nextName === projectName) return

  projects.value = projects.value.map((item) => (item === projectName ? nextName : item))
  projectSessions.value = {
    ...projectSessions.value,
    [nextName]: projectSessions.value[projectName] ?? [],
  }
  projectDescriptions.value = {
    ...projectDescriptions.value,
    [nextName]: projectDescriptions.value[projectName] ?? '',
  }
  delete projectSessions.value[projectName]
  delete projectDescriptions.value[projectName]

  if (activeProject.value === projectName) {
    activeProject.value = nextName
  }
}

const deleteProject = (projectName: string) => {
  actionDialog.value = { type: 'delete-project', projectName, value: projectName }
  openActionMenu.value = ''
}

const applyDeleteProject = (projectName: string) => {
  projects.value = projects.value.filter((item) => item !== projectName)
  delete projectSessions.value[projectName]
  delete projectDescriptions.value[projectName]
  if (activeProject.value === projectName) {
    activeProject.value = ''
    activeProjectSessionId.value = ''
    currentMode.value = 'chat'
    isProjectHome.value = false
    isPendingProjectSession.value = false
  }
  ElMessage.success('项目已删除')
}

const findProjectSession = (sessionId: string) => {
  for (const projectName of Object.keys(projectSessions.value)) {
    const session = projectSessions.value[projectName].find((item) => item.id === sessionId)
    if (session) return { projectName, session }
  }
  return undefined
}

const renameSession = (session: ChatSession) => {
  actionDialog.value = { type: 'rename-session', sessionId: session.id, value: session.title }
  openActionMenu.value = ''
}

const deleteSession = (sessionId: string) => {
  const session = chatStore.sessions.find((item) => item.id === sessionId) ?? findProjectSession(sessionId)?.session
  actionDialog.value = { type: 'delete-session', sessionId, value: session?.title ?? '这个对话' }
  openActionMenu.value = ''
}

const applyDeleteSession = (sessionId: string) => {
  const projectMatch = findProjectSession(sessionId)
  if (projectMatch) {
    projectSessions.value[projectMatch.projectName] = projectSessions.value[projectMatch.projectName].filter(
      (session) => session.id !== sessionId,
    )
    if (activeProjectSessionId.value === sessionId) {
      activeProjectSessionId.value = ''
      isProjectHome.value = true
    }
  } else {
    chatStore.deleteSession(sessionId)
  }
  ElMessage.success('对话已删除')
}

const closeActionDialog = () => {
  actionDialog.value = null
}

const confirmActionDialog = () => {
  const dialog = actionDialog.value
  if (!dialog) return

  if (dialog.type === 'create-project') {
    applyCreateProject(dialog.value)
  }

  if (dialog.type === 'rename-project') {
    applyRenameProject(dialog.projectName, dialog.value)
  }

  if (dialog.type === 'delete-project') {
    applyDeleteProject(dialog.projectName)
  }

  if (dialog.type === 'rename-session') {
    const projectMatch = findProjectSession(dialog.sessionId)
    if (projectMatch) {
      const normalized = dialog.value.trim()
      if (normalized) {
        projectMatch.session.title = normalized
        projectMatch.session.updatedAt = Date.now()
      }
    } else {
      chatStore.renameSession(dialog.sessionId, dialog.value)
    }
  }

  if (dialog.type === 'delete-session') {
    applyDeleteSession(dialog.sessionId)
  }

  actionDialog.value = null
}

const handleAvatarUpload = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  avatarImage.value = URL.createObjectURL(file)
}

const saveSettings = () => {
  profileName.value = draftProfileName.value.trim() || '用户'
  profileAvatar.value = draftProfileName.value.trim().slice(0, 2).toUpperCase()
  themeMode.value = draftThemeMode.value
  isSettingsOpen.value = false
  ElMessage.success('设置已保存')
}

const closeSettings = () => {
  draftThemeMode.value = themeMode.value
  isSettingsOpen.value = false
}

const handleGlobalPointerDown = (event: PointerEvent) => {
  const target = event.target as HTMLElement | null
  if (!target) return

  if (actionDialog.value && !target.closest('.confirm-dialog')) {
    actionDialog.value = null
  }

  if (isSettingsOpen.value && !target.closest('.settings-dialog')) {
    closeSettings()
  }

  if (
    openActionMenu.value &&
    !target.closest('.action-menu') &&
    !target.closest('.row-action') &&
    !target.closest('.project-chat-row > button')
  ) {
    openActionMenu.value = ''
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleGlobalPointerDown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleGlobalPointerDown, true)
  if (liveTimer !== undefined) {
    window.clearInterval(liveTimer)
  }
})

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
</script>

<template>
  <main
    class="chat-shell"
    :class="{
      'sidebar-collapsed': isSidebarCollapsed,
      'theme-dark': themeMode === 'dark',
    }"
  >
    <input
      ref="textFileInputRef"
      class="text-file-input"
      type="file"
      accept=".txt,.md,.markdown,.csv,.json,.js,.jsx,.ts,.tsx,.vue,.html,.css,.scss,.less,.xml,.yaml,.yml,.log,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.bmp,.gif,text/*,application/json,application/pdf,image/*"
      @change="handleTextFileUpload"
    />
    <aside class="sidebar">
      <div class="sidebar-top">
        <button class="sidebar-icon-button" type="button" aria-label="搜索" @click="openSearch">
          <Search :size="18" />
        </button>
        <button class="sidebar-title" type="button" @click="isSidebarCollapsed = false">
          <span class="brand-mark">
            <ChatDotRound :size="18" />
          </span>
          <span>AI Chat</span>
        </button>
        <button class="sidebar-icon-button collapse-trigger" type="button" aria-label="收起侧边栏" @click="isSidebarCollapsed = !isSidebarCollapsed">
          <MoreFilled :size="18" />
        </button>
      </div>

      <button class="new-chat" type="button" @click="createSession">
        <Plus :size="18" />
        <span>新建对话</span>
      </button>

      <div class="sidebar-scroll">
        <section class="sidebar-section project-section" :class="{ closed: !isProjectsOpen }">
          <button class="section-toggle" type="button" @click="isProjectsOpen = !isProjectsOpen">
            <component :is="isProjectsOpen ? ArrowDown : ArrowRight" :size="14" />
            <span>项目</span>
          </button>
          <div class="project-list">
            <button class="new-project" type="button" @click="openCreateProjectDialog">
              <span class="folder-plus">
                <Folder :size="19" />
                <Plus :size="11" />
              </span>
              <span>新项目</span>
            </button>
            <div v-for="project in projects" :key="project" class="nav-row-wrap">
              <button
                class="project-item"
                :class="{ active: project === activeProject }"
                type="button"
                @click="selectProject(project)"
              >
                <component :is="project === activeProject ? FolderOpened : Folder" :size="16" />
                <span>{{ project }}</span>
              </button>
              <button class="row-action" type="button" aria-label="项目操作" @click.stop="toggleActionMenu(`project-${project}`, $event)">
                <MoreFilled :size="15" />
              </button>
              <div v-if="openActionMenu === `project-${project}`" class="action-menu" :style="actionMenuStyle">
                <button type="button" @click="renameProject(project)">
                  <EditPen :size="16" />
                  <span>重命名项目</span>
                </button>
                <button type="button" class="danger" @click="deleteProject(project)">
                  <Delete :size="16" />
                  <span>删除项目</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="sidebar-section recent-section" :class="{ closed: !isRecentOpen }">
          <button class="section-toggle" type="button" @click="isRecentOpen = !isRecentOpen">
            <component :is="isRecentOpen ? ArrowDown : ArrowRight" :size="14" />
            <span>最近的对话</span>
          </button>
          <div class="session-list">
            <p v-if="chatStore.sessions.length === 0" class="sidebar-empty">暂无对话</p>
            <div v-for="session in chatStore.sessions" :key="session.id" class="nav-row-wrap">
              <button
                class="session-item"
                :class="{ active: session.id === chatStore.activeSessionId && !isProjectHome && !isPendingNewSession && !isPendingProjectSession }"
                type="button"
                @click="chatStore.switchSession(session.id); currentMode = 'chat'; isProjectHome = false; activeProject = ''; activeProjectSessionId = ''; isPendingNewSession = false; isPendingProjectSession = false"
              >
                <EditPen :size="16" />
                <span>{{ session.title }}</span>
              </button>
              <button class="row-action" type="button" aria-label="对话操作" @click.stop="toggleActionMenu(`session-${session.id}`, $event)">
                <MoreFilled :size="15" />
              </button>
              <div v-if="openActionMenu === `session-${session.id}`" class="action-menu" :style="actionMenuStyle">
                <button type="button" @click="renameSession(session)">
                  <EditPen :size="16" />
                  <span>重命名对话</span>
                </button>
                <button type="button" class="danger" @click="deleteSession(session.id)">
                  <Delete :size="16" />
                  <span>删除对话</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="sidebar-footer">
        <button class="footer-action" type="button" @click="isSettingsOpen = true">
          <Setting :size="17" />
          <span>设置</span>
        </button>
        <div class="profile-chip">
          <span class="profile-avatar" :style="avatarImage ? { backgroundImage: `url(${avatarImage})` } : undefined">
            <template v-if="!avatarImage">{{ savedAvatarDisplay }}</template>
          </span>
          <span>{{ profileName || '用户' }}</span>
        </div>
      </div>
    </aside>

    <section class="conversation">
      <header class="conversation-header">
        <button v-if="isSidebarCollapsed" class="open-sidebar" type="button" aria-label="展开侧边栏" @click="isSidebarCollapsed = false">
          <MoreFilled :size="18" />
        </button>
        <button class="model-button" type="button">
          <span>{{ isProjectMode ? '项目' : 'AI Chat' }}</span>
          <strong>{{ isProjectMode ? activeProject : headerSessionTitle }}</strong>
        </button>
      </header>

      <template v-if="isProjectMode && isProjectHome">
        <div class="project-home">
          <div class="project-home-inner">
            <div class="project-title-row">
              <FolderOpened :size="34" />
              <h1>{{ activeProject }}</h1>
            </div>
            <textarea
              v-model="projectDescriptions[activeProject]"
              class="project-description"
              placeholder="添加项目说明，让这个项目里的对话有更清晰的背景。"
            />

            <div class="project-hero-composer">
              <el-input
                v-model="draft"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 4 }"
                resize="none"
                :placeholder="`${activeProject}中的新聊天`"
                @keydown.enter.exact.prevent="sendProjectMessage"
              />
              <div class="composer-tools project-tools">
                <button
                  type="button"
                  data-tool="deep-thinking"
                  :aria-pressed="isDeepThinking"
                  :class="{ active: isDeepThinking }"
                  @click="toggleDeepThinking"
                >
                  <ChatDotRound :size="16" />
                  <span>深度思考</span>
                </button>
                <button
                  type="button"
                  data-tool="agent-mode"
                  :aria-pressed="isAgentMode"
                  :class="{ active: isAgentMode }"
                  @click="toggleAgentMode"
                >
                  <Setting :size="16" />
                  <span>Agent 模式</span>
                </button>
                <button
                  type="button"
                  data-tool="file-parser"
                  :disabled="isParsingFile"
                  @click="openTextFilePicker"
                >
                  <Plus :size="16" />
                  <span>{{ isParsingFile ? '解析中' : '文件解析' }}</span>
                </button>
                <button
                  type="button"
                  data-tool="web-search"
                  :aria-pressed="isWebSearch"
                  :class="{ active: isWebSearch }"
                  @click="toggleWebSearch"
                >
                  <Search :size="16" />
                  <span>联网搜索</span>
                </button>
              </div>
              <button v-if="isResponding" type="button" class="project-send project-stop" @click="stopResponding">
                <span />
              </button>
              <button v-else type="button" class="project-send" :disabled="!hasDraft" @click="sendProjectMessage">
                <Promotion :size="22" />
              </button>
            </div>

            <div class="project-tabs">
              <button class="active" type="button">聊天</button>
            </div>

            <div class="project-chat-list">
              <article
                v-for="session in activeProjectSessions"
                :key="`home-${session.id}`"
                class="project-chat-row"
                @click="switchProjectSession(session.id)"
              >
                <div>
                  <h3>{{ session.title }}</h3>
                  <p>{{ getResultPreview(session) }}</p>
                </div>
                <time>{{ formatTime(session.updatedAt) }}</time>
                <button class="home-row-action" type="button" aria-label="对话操作" @click.stop="toggleActionMenu(`home-session-${session.id}`, $event)">
                  <MoreFilled :size="17" />
                </button>
                <div v-if="openActionMenu === `home-session-${session.id}`" class="action-menu home-menu" :style="actionMenuStyle">
                  <button type="button" @click.stop="renameSession(session)">
                    <EditPen :size="16" />
                    <span>重命名对话</span>
                  </button>
                  <button type="button" class="danger" @click.stop="deleteSession(session.id)">
                    <Delete :size="16" />
                    <span>删除对话</span>
                  </button>
                </div>
              </article>
              <p v-if="activeProjectSessions.length === 0" class="project-empty">还没有项目对话。先在上方输入第一条消息。</p>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="isFreshSession">
        <div class="welcome-center">
          <div class="welcome-card">
            <span class="welcome-avatar" :style="avatarImage ? { backgroundImage: `url(${avatarImage})` } : undefined">
              <template v-if="!avatarImage">{{ savedAvatarDisplay }}</template>
            </span>
            <p v-if="isProjectMode" class="project-kicker">项目：{{ activeProject }}</p>
            <h1>{{ isProjectMode ? '在这个项目中开始对话' : '有什么可以帮忙的？' }}</h1>
            <div class="composer center-composer">
              <el-input
                v-model="draft"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 5 }"
                resize="none"
                placeholder="给 AI Chat 发送消息"
                @keydown.enter.exact.prevent="send"
              />
              <div class="composer-tools">
                <button
                  type="button"
                  data-tool="deep-thinking"
                  :aria-pressed="isDeepThinking"
                  :class="{ active: isDeepThinking }"
                  @click="toggleDeepThinking"
                >
                  <ChatDotRound :size="16" />
                  <span>深度思考</span>
                </button>
                <button
                  type="button"
                  data-tool="agent-mode"
                  :aria-pressed="isAgentMode"
                  :class="{ active: isAgentMode }"
                  @click="toggleAgentMode"
                >
                  <Setting :size="16" />
                  <span>Agent 模式</span>
                </button>
                <button
                  type="button"
                  data-tool="file-parser"
                  :disabled="isParsingFile"
                  @click="openTextFilePicker"
                >
                  <Plus :size="16" />
                  <span>{{ isParsingFile ? '解析中' : '文件解析' }}</span>
                </button>
                <button
                  type="button"
                  data-tool="web-search"
                  :aria-pressed="isWebSearch"
                  :class="{ active: isWebSearch }"
                  @click="toggleWebSearch"
                >
                  <Search :size="16" />
                  <span>联网搜索</span>
                </button>
              </div>
              <el-button
                v-if="isResponding"
                class="composer-stop"
                @click="stopResponding"
              >
                <span />
              </el-button>
              <el-button
                v-else
                type="primary"
                :icon="Promotion"
                :disabled="!hasDraft"
                circle
                @click="send"
              />
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div ref="messagesRef" class="messages" @click="copyRenderedCode" @scroll="updateActiveMessageFromScroll">
          <article
            v-for="message in activeSession?.messages"
            :key="message.id"
            :data-message-id="message.id"
            :data-message-role="message.role"
            class="message-row"
            :class="message.role"
          >
            <div class="avatar">{{ message.role === 'assistant' ? 'AI' : '你' }}</div>
            <div class="message-content">
              <div class="message-meta">
                <strong>{{ message.role === 'assistant' ? 'AI Chat' : '你' }}</strong>
                <span>{{ formatTime(message.createdAt) }}</span>
              </div>
              <div v-if="message.role === 'assistant' && getReasoningContent(message)" class="reasoning-panel">
                <button
                  class="reasoning-toggle"
                  type="button"
                  :aria-expanded="isReasoningOpen(message.id)"
                  @click="toggleReasoning(message.id)"
                >
                  <ChatDotRound :size="18" />
                  <span>{{ getReasoningLabel(message) }}</span>
                  <component class="reasoning-chevron" :is="isReasoningOpen(message.id) ? ArrowDown : ArrowRight" :size="15" />
                </button>
                <div v-show="isReasoningOpen(message.id)" class="reasoning-content">
                  <div class="reasoning-markdown markdown-body" v-html="renderMarkdown(getReasoningContent(message))" />
                </div>
              </div>
              <div v-if="message.id === streamingAssistantMessageId && streamingAssistantMessageContent" class="streaming-markdown">
                <div class="markdown-body" v-html="renderMarkdown(stripFinalAnswerMarker(streamingAssistantMessageContent))" />
                <span class="stream-cursor" />
              </div>
              <div v-else-if="message.content" class="markdown-body" v-html="renderMarkdown(getAnswerContent(message))" />
            </div>
          </article>

          <article v-if="isWaitingForFirstToken" class="message-row assistant">
            <div class="avatar">AI</div>
            <div class="message-content">
              <div class="message-meta">
                <strong>AI Chat</strong>
                <span>正在生成</span>
              </div>
              <div class="typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </article>
        </div>

        <aside v-if="messageNavigatorItems.length" class="message-navigator" aria-label="当前对话导航">
          <button
            v-for="item in messageNavigatorItems"
            :key="item.id"
            class="message-nav-item"
            :class="{ active: item.id === activeMessageId }"
            type="button"
            @mouseenter="showNavigatorTooltip(item, $event)"
            @mouseleave="hideNavigatorTooltip"
            @focus="showNavigatorTooltip(item, $event)"
            @blur="hideNavigatorTooltip"
            @click="jumpToMessage(item.id)"
          >
            <span>{{ item.label }}</span>
            <i />
          </button>
        </aside>

        <div
          v-if="hoveredNavigatorItem"
          class="message-nav-tooltip"
          :style="{
            right: `${hoveredNavigatorItem.right}px`,
            top: `${hoveredNavigatorItem.top}px`,
          }"
        >
          {{ hoveredNavigatorItem.label }}
        </div>

        <div class="composer-panel">
          <div class="composer">
            <el-input
              v-model="draft"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 5 }"
              resize="none"
              placeholder="给 AI Chat 发送消息"
              @keydown.enter.exact.prevent="send"
            />
            <div class="composer-tools">
              <button
                type="button"
                data-tool="deep-thinking"
                :aria-pressed="isDeepThinking"
                :class="{ active: isDeepThinking }"
                @click="toggleDeepThinking"
              >
                <ChatDotRound :size="16" />
                <span>深度思考</span>
              </button>
              <button
                type="button"
                data-tool="agent-mode"
                :aria-pressed="isAgentMode"
                :class="{ active: isAgentMode }"
                @click="toggleAgentMode"
              >
                <Setting :size="16" />
                <span>Agent 模式</span>
              </button>
              <button
                type="button"
                data-tool="file-parser"
                :disabled="isParsingFile"
                @click="openTextFilePicker"
              >
                <Plus :size="16" />
                <span>{{ isParsingFile ? '解析中' : '文件解析' }}</span>
              </button>
              <button
                type="button"
                data-tool="web-search"
                :aria-pressed="isWebSearch"
                :class="{ active: isWebSearch }"
                @click="toggleWebSearch"
              >
                <Search :size="16" />
                <span>联网搜索</span>
              </button>
            </div>
            <el-button
              v-if="isResponding"
              class="composer-stop"
              @click="stopResponding"
            >
              <span />
            </el-button>
            <el-button
              v-else
              type="primary"
              :icon="Promotion"
              :disabled="!hasDraft"
              circle
              @click="send"
            />
          </div>
          <p class="composer-hint">AI 可能会出错，请核对重要信息。</p>
        </div>
      </template>
    </section>

    <div v-if="isSearchOpen" class="search-overlay" @click.self="closeSearch">
      <div class="search-dialog">
        <div class="search-box">
          <Search :size="20" />
          <input v-model="searchText" placeholder="搜索对话内容..." />
          <button v-if="searchText" type="button" aria-label="清除搜索" @click="searchText = ''">
            <Close :size="18" />
          </button>
          <button v-else type="button" aria-label="关闭搜索" @click="closeSearch">
            <Close :size="18" />
          </button>
        </div>
        <div class="search-results" :class="{ idle: !hasSearchQuery }">
          <p v-if="!hasSearchQuery" class="search-idle">输入关键词后开始搜索对话</p>
          <button
            v-for="session in searchResults"
            :key="session.id"
            class="search-result"
            type="button"
            @click="switchFromSearch(session)"
          >
            <span class="spark" />
            <span class="result-copy">
              <strong>
                <template v-for="(part, index) in highlightParts(session.title)" :key="`${session.id}-title-${index}`">
                  <mark v-if="part.hit">{{ part.text }}</mark>
                  <span v-else>{{ part.text }}</span>
                </template>
              </strong>
              <small>
                <template v-for="(part, index) in highlightParts(getResultPreview(session))" :key="`${session.id}-preview-${index}`">
                  <mark v-if="part.hit">{{ part.text }}</mark>
                  <span v-else>{{ part.text }}</span>
                </template>
              </small>
            </span>
          </button>
          <p v-if="hasSearchQuery && searchResults.length === 0" class="empty-search">没有找到相关对话</p>
        </div>
      </div>
    </div>

    <div v-if="isSettingsOpen" class="settings-overlay" @click="closeSettings">
      <section class="settings-dialog" @click.stop>
        <header>
          <div>
            <p>个人设置</p>
            <h2>账户与外观</h2>
          </div>
          <button type="button" aria-label="关闭设置" @click="closeSettings">
            <Close :size="18" />
          </button>
        </header>
        <div class="settings-body">
          <div class="avatar-setting">
            <span class="profile-avatar large" :style="avatarImage ? { backgroundImage: `url(${avatarImage})` } : undefined">
              <template v-if="!avatarImage">{{ savedAvatarDisplay }}</template>
            </span>
            <label class="upload-button">
              <Plus :size="15" />
              <span>上传头像</span>
              <input type="file" accept="image/*" @change="handleAvatarUpload" />
            </label>
          </div>
          <label>
            <span>用户名</span>
            <input v-model="draftProfileName" placeholder="输入用户名" />
          </label>
          <div class="theme-switch">
            <button type="button" :class="{ active: draftThemeMode === 'light' }" @click="draftThemeMode = 'light'">
              <Sunny :size="15" />
              <span>白色</span>
            </button>
            <button type="button" :class="{ active: draftThemeMode === 'dark' }" @click="draftThemeMode = 'dark'">
              <Moon :size="15" />
              <span>黑色</span>
            </button>
          </div>
        </div>
        <footer>
          <button class="cancel-settings" type="button" @click="closeSettings">取消</button>
          <button class="save-settings" type="button" @click="saveSettings">保存设置</button>
        </footer>
      </section>
    </div>

    <div v-if="actionDialog" class="confirm-overlay" @click="closeActionDialog">
      <section class="confirm-dialog" @click.stop>
        <header>
          <h2>
            {{ actionDialog.type === 'create-project' ? '新项目' : actionDialog.type.startsWith('rename') ? '重命名' : '确认删除' }}
          </h2>
          <button type="button" aria-label="关闭弹窗" @click="closeActionDialog">
            <Close :size="18" />
          </button>
        </header>
        <div class="confirm-body">
          <template v-if="actionDialog.type === 'create-project' || actionDialog.type.startsWith('rename')">
            <label>
              <span>{{ actionDialog.type === 'create-project' ? '项目名称' : '名称' }}</span>
              <input v-model="actionDialog.value" :placeholder="actionDialog.type === 'create-project' ? '输入新项目名称' : ''" />
            </label>
          </template>
          <template v-else>
            <p>删除后将从当前列表移除。</p>
            <strong>{{ actionDialog.value }}</strong>
          </template>
        </div>
        <footer>
          <button class="cancel-settings" type="button" @click="closeActionDialog">取消</button>
          <button
            class="confirm-primary"
            :class="{ danger: actionDialog.type.startsWith('delete') }"
            type="button"
            @click="confirmActionDialog"
          >
            {{ actionDialog.type === 'create-project' || actionDialog.type.startsWith('rename') ? '保存' : '删除' }}
          </button>
        </footer>
      </section>
    </div>
  </main>
</template>
