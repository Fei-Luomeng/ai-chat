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

interface PromptTemplate {
  id: string
  label: string
  prompt: string
}

interface ModelSettings {
  defaultAgentMode: boolean
  defaultDeepThinking: boolean
  defaultWebSearch: boolean
  maxTokens: number
  temperature: number
}

interface PersistedAppState {
  activeProject?: string
  avatarImage?: string
  modelSettings?: ModelSettings
  profileName?: string
  promptTemplates?: PromptTemplate[]
  projectDescriptions?: Record<string, string>
  projects?: string[]
  projectSessions?: Record<string, ChatSession[]>
  themeMode?: 'light' | 'dark'
}

const APP_STORAGE_KEY = 'ai-chat:app-state'
const CHAT_STORAGE_KEY = 'ai-chat:sessions'
const TOOL_STATE_KEY = 'ai-chat:tool-state'
const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  defaultAgentMode: false,
  defaultDeepThinking: false,
  defaultWebSearch: false,
  maxTokens: 0,
  temperature: 1,
}
const LEGACY_WELCOME_CONTENT = '你好，我是你的 AI 助手。可以帮你整理想法、写代码、润色文案，或者陪你拆解一个复杂问题。'
const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'explain-code',
    label: '解释代码',
    prompt: '请解释下面这段代码的作用、执行流程、关键语法点，并指出可能的优化点：\n\n',
  },
  {
    id: 'interview',
    label: '面试八股',
    prompt: '请用前端面试的方式回答这个问题：先给结论，再讲原理，然后给一个简短例子，最后补充常见追问。\n\n问题：',
  },
  {
    id: 'resume',
    label: '简历优化',
    prompt: '请帮我优化下面这段简历描述：要求更像真实项目经历，突出业务价值、技术难点和量化结果，不要夸张。\n\n',
  },
  {
    id: 'polish',
    label: '翻译润色',
    prompt: '请润色下面这段内容，让表达更自然、清晰、有礼貌。保留原意，不要过度扩写。\n\n',
  },
  {
    id: 'weekly',
    label: '生成周报',
    prompt: '请根据下面的工作记录生成一份简洁周报，包含：本周完成、问题风险、下周计划。\n\n',
  },
]

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
const initialModelSettings = {
  ...DEFAULT_MODEL_SETTINGS,
  ...(storedAppState.modelSettings ?? {}),
}
const draft = ref('')
const messagesRef = ref<HTMLElement | null>(null)
const editingMessageId = ref('')
const editingDraft = ref('')
const isSidebarCollapsed = ref(false)
const isSearchOpen = ref(false)
const isExportOpen = ref(false)
const isTemplateManagerOpen = ref(false)
const isContextClearOpen = ref(false)
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
const modelSettings = ref<ModelSettings>(initialModelSettings)
const draftModelSettings = ref<ModelSettings>({ ...initialModelSettings })
const isDeepThinking = ref(initialModelSettings.defaultDeepThinking)
const isAgentMode = ref(Boolean(storedToolState.agentMode ?? initialModelSettings.defaultAgentMode))
const isWebSearch = ref(Boolean(storedToolState.webSearch ?? initialModelSettings.defaultWebSearch))
const exportMode = ref<'all' | 'selected'>('all')
const selectedExportMessageIds = ref<string[]>([])
const editingTemplateId = ref('')
const draftTemplateLabel = ref('')
const draftTemplatePrompt = ref('')
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
const promptTemplates = ref<PromptTemplate[]>(storedAppState.promptTemplates ?? DEFAULT_PROMPT_TEMPLATES)

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

const sortSessions = (sessions: ChatSession[]) =>
  [...sessions].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1

    return right.updatedAt - left.updatedAt
  })

const sidebarSessions = computed(() => sortSessions(chatStore.sessions))

const activeProjectSessions = computed(() => {
  if (!activeProject.value) return []

  return sortSessions(projectSessions.value[activeProject.value] ?? [])
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

const exportableMessages = computed(() => activeSession.value?.messages ?? [])
const selectedExportMessages = computed(() =>
  exportableMessages.value.filter((message) => selectedExportMessageIds.value.includes(message.id)),
)

const savedAvatarDisplay = computed(() => profileAvatar.value.trim().slice(0, 2).toUpperCase() || 'U')

const persistAppState = () => {
  const state: PersistedAppState = {
    activeProject: activeProject.value,
    avatarImage: avatarImage.value,
    modelSettings: modelSettings.value,
    profileName: profileName.value,
    promptTemplates: promptTemplates.value,
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

const persistChatSessions = () => {
  try {
    window.localStorage?.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatStore.sessions))
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

const getMessagePlainText = (message: ChatMessage) => {
  if (message.role === 'assistant') return getAnswerContent(message)

  return message.content
}

const copyMessage = async (message: ChatMessage) => {
  const content = getMessagePlainText(message).trim()
  if (!content) return

  await navigator.clipboard.writeText(content)
  ElMessage.success('已复制消息')
}

const getSafeFileName = (value: string) =>
  (value || 'AI Chat 对话')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48) || 'AI Chat 对话'

const openExportDialog = () => {
  const session = activeSession.value
  if (!session || session.messages.length === 0) {
    ElMessage.warning('当前没有可导出的对话')
    return
  }

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
  const preview = getMessagePlainText(message).trim().replace(/\s+/g, ' ')

  return preview.length > 72 ? `${preview.slice(0, 72)}...` : preview || '(空消息)'
}

const exportCurrentSession = () => {
  const session = activeSession.value
  if (!session) return

  const messages = exportMode.value === 'all' ? session.messages : selectedExportMessages.value
  if (messages.length === 0) {
    ElMessage.warning('请至少选择一条消息')
    return
  }

  const exportedAt = new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(Date.now())
  const lines = [
    `# ${session.title}`,
    '',
    `导出时间：${exportedAt}`,
    '',
    exportMode.value === 'selected' ? `导出范围：已选择 ${messages.length} 条消息` : '导出范围：全部对话',
    '',
    ...messages.flatMap((message) => [
      `## ${message.role === 'assistant' ? 'AI Chat' : '你'} · ${formatTime(message.createdAt)}`,
      '',
      getMessagePlainText(message).trim() || '(空消息)',
      '',
    ]),
  ]
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
  maxTokens: modelSettings.value.maxTokens || undefined,
  temperature: modelSettings.value.temperature,
  webSearch: isWebSearch.value || isToolButtonPressed('web-search'),
})

const applyPromptTemplate = (template: PromptTemplate) => {
  const currentDraft = draft.value.trim()
  draft.value = currentDraft ? `${currentDraft}\n\n${template.prompt}` : template.prompt
}

const resetTemplateDraft = () => {
  editingTemplateId.value = ''
  draftTemplateLabel.value = ''
  draftTemplatePrompt.value = ''
}

const openTemplateManager = () => {
  resetTemplateDraft()
  isTemplateManagerOpen.value = true
}

const closeTemplateManager = () => {
  isTemplateManagerOpen.value = false
  resetTemplateDraft()
}

const editPromptTemplate = (template: PromptTemplate) => {
  editingTemplateId.value = template.id
  draftTemplateLabel.value = template.label
  draftTemplatePrompt.value = template.prompt
}

const savePromptTemplate = () => {
  const label = draftTemplateLabel.value.trim()
  const prompt = draftTemplatePrompt.value.trim()

  if (!label || !prompt) {
    ElMessage.warning('模板名称和内容都要填写')
    return
  }

  if (editingTemplateId.value) {
    promptTemplates.value = promptTemplates.value.map((template) =>
      template.id === editingTemplateId.value ? { ...template, label, prompt } : template,
    )
    ElMessage.success('模板已更新')
  } else {
    promptTemplates.value = [{ id: `template-${createId()}`, label, prompt }, ...promptTemplates.value]
    ElMessage.success('模板已新增')
  }

  resetTemplateDraft()
}

const deletePromptTemplate = (templateId: string) => {
  promptTemplates.value = promptTemplates.value.filter((template) => template.id !== templateId)
  if (editingTemplateId.value === templateId) resetTemplateDraft()
  ElMessage.success('模板已删除')
}

const restoreDefaultTemplates = () => {
  promptTemplates.value = DEFAULT_PROMPT_TEMPLATES.map((template) => ({ ...template }))
  resetTemplateDraft()
  ElMessage.success('已恢复默认模板')
}

const openContextClearDialog = () => {
  const session = activeSession.value
  if (isResponding.value) return

  if (!session || session.messages.length === 0) {
    ElMessage.warning('当前没有可清空的上下文')
    return
  }

  isContextClearOpen.value = true
}

const closeContextClearDialog = () => {
  isContextClearOpen.value = false
}

const clearCurrentContext = () => {
  const session = activeSession.value
  if (!session || isResponding.value) return

  const now = Date.now()
  session.contextClearedAt = now
  session.updatedAt = now

  if (isProjectMode.value) {
    persistAppState()
  } else {
    persistChatSessions()
  }

  isContextClearOpen.value = false
  ElMessage.success('已清空后续请求上下文，页面历史会保留')
}

const toggleChatSessionPinned = (session: ChatSession) => {
  const willPin = !session.pinned
  chatStore.toggleSessionPinned(session.id)
  openActionMenu.value = ''
  ElMessage.success(willPin ? '已置顶' : '已取消置顶')
}

const toggleProjectSessionPinned = (session: ChatSession) => {
  const willPin = !session.pinned
  session.pinned = willPin
  openActionMenu.value = ''
  persistAppState()
  ElMessage.success(willPin ? '已置顶' : '已取消置顶')
}

const startEditingMessage = (message: ChatMessage) => {
  if (isResponding.value || message.role !== 'user') return

  editingMessageId.value = message.id
  editingDraft.value = message.content
}

const cancelEditingMessage = () => {
  editingMessageId.value = ''
  editingDraft.value = ''
}

const hasPreviousUserMessage = (message: ChatMessage) => {
  const session = activeSession.value
  if (!session || message.role !== 'assistant') return false

  const messageIndex = session.messages.findIndex((item) => item.id === message.id)
  return session.messages.slice(0, messageIndex).some((item) => item.role === 'user')
}

const resubmitUserMessage = async (messageId: string, nextContent?: string) => {
  const session = activeSession.value
  if (!session || isResponding.value) return

  const messageIndex = session.messages.findIndex((message) => message.id === messageId && message.role === 'user')
  if (messageIndex === -1) return

  const content = (nextContent ?? session.messages[messageIndex].content).trim()
  if (!content) return

  const sendOptions = getSendOptions()
  session.messages.splice(messageIndex)
  session.updatedAt = Date.now()

  if (isProjectMode.value) {
    persistAppState()
    await sendProjectContent(content, sendOptions)
    return
  }

  await chatStore.sendMessage(content, sendOptions)
}

const submitEditedMessage = async (message: ChatMessage) => {
  const content = editingDraft.value.trim()
  if (!content) return

  cancelEditingMessage()
  await resubmitUserMessage(message.id, content)
}

const regenerateAssistantMessage = async (message: ChatMessage) => {
  const session = activeSession.value
  if (!session || isResponding.value || message.role !== 'assistant') return

  const messageIndex = session.messages.findIndex((item) => item.id === message.id)
  const userMessage = session.messages
    .slice(0, messageIndex)
    .reverse()
    .find((item) => item.role === 'user')

  if (!userMessage) return

  await resubmitUserMessage(userMessage.id)
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
  [projects, projectSessions, projectDescriptions, promptTemplates, modelSettings, activeProject, profileName, avatarImage, themeMode],
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
    contextClearedAt: session.contextClearedAt,
    deepThinking: sendOptions.deepThinking,
    maxTokens: sendOptions.maxTokens,
    temperature: sendOptions.temperature,
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

const removeInterruptedAssistant = (session: ChatSession | undefined, streamingMessageId: string) => {
  if (!session) return

  const lastMessage = session.messages.at(-1)
  const shouldRemoveAssistant =
    lastMessage?.role === 'assistant' &&
    (!lastMessage.content.trim() || Boolean(streamingMessageId && lastMessage.id === streamingMessageId))

  if (shouldRemoveAssistant) {
    session.messages.splice(-1, 1)
    session.updatedAt = Date.now()
  }
}

const stopResponding = () => {
  const session = activeSession.value
  const chatStreamingMessageId = chatStore.streamingMessageId
  const projectStreamingId = projectStreamingMessageId.value

  chatStore.stopResponding()
  projectAbortController?.abort()
  projectAbortController = null

  if (isProjectMode.value) {
    removeInterruptedAssistant(session, projectStreamingId)
    isPendingProjectSession.value = false
    isProjectHome.value = false
    persistAppState()
  } else {
    removeInterruptedAssistant(session, chatStreamingMessageId)
    isPendingNewSession.value = false
    activeProject.value = ''
    activeProjectSessionId.value = ''
    isProjectHome.value = false
    persistChatSessions()
  }

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
  isDeepThinking.value = modelSettings.value.defaultDeepThinking
  isAgentMode.value = modelSettings.value.defaultAgentMode
  isWebSearch.value = modelSettings.value.defaultWebSearch
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
  isDeepThinking.value = modelSettings.value.defaultDeepThinking
  isAgentMode.value = modelSettings.value.defaultAgentMode
  isWebSearch.value = modelSettings.value.defaultWebSearch
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

const openSettings = () => {
  draftProfileName.value = profileName.value
  draftThemeMode.value = themeMode.value
  draftModelSettings.value = { ...modelSettings.value }
  isSettingsOpen.value = true
}

const saveSettings = () => {
  profileName.value = draftProfileName.value.trim() || '用户'
  profileAvatar.value = draftProfileName.value.trim().slice(0, 2).toUpperCase()
  themeMode.value = draftThemeMode.value
  modelSettings.value = {
    defaultAgentMode: Boolean(draftModelSettings.value.defaultAgentMode),
    defaultDeepThinking: Boolean(draftModelSettings.value.defaultDeepThinking),
    defaultWebSearch: Boolean(draftModelSettings.value.defaultWebSearch),
    maxTokens: Math.max(0, Math.min(8192, Math.round(Number(draftModelSettings.value.maxTokens) || 0))),
    temperature: Math.max(0, Math.min(2, Number(draftModelSettings.value.temperature) || 0)),
  }
  isAgentMode.value = modelSettings.value.defaultAgentMode
  isDeepThinking.value = modelSettings.value.defaultDeepThinking
  isWebSearch.value = modelSettings.value.defaultWebSearch
  persistToolState()
  isSettingsOpen.value = false
  ElMessage.success('设置已保存')
}

const closeSettings = () => {
  draftThemeMode.value = themeMode.value
  draftModelSettings.value = { ...modelSettings.value }
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
            <div v-for="session in sidebarSessions" :key="session.id" class="nav-row-wrap">
              <button
                class="session-item"
                :class="{
                  active: session.id === chatStore.activeSessionId && !isProjectHome && !isPendingNewSession && !isPendingProjectSession,
                  pinned: session.pinned,
                }"
                type="button"
                @click="chatStore.switchSession(session.id); currentMode = 'chat'; isProjectHome = false; activeProject = ''; activeProjectSessionId = ''; isPendingNewSession = false; isPendingProjectSession = false"
              >
                <EditPen :size="16" />
                <span>{{ session.title }}</span>
                <small v-if="session.pinned" class="pin-mark">置顶</small>
              </button>
              <button class="row-action" type="button" aria-label="对话操作" @click.stop="toggleActionMenu(`session-${session.id}`, $event)">
                <MoreFilled :size="15" />
              </button>
              <div v-if="openActionMenu === `session-${session.id}`" class="action-menu" :style="actionMenuStyle">
                <button type="button" @click="toggleChatSessionPinned(session)">
                  <ChatDotRound :size="16" />
                  <span>{{ session.pinned ? '取消置顶' : '置顶对话' }}</span>
                </button>
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
        <button class="footer-action" type="button" @click="openSettings">
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
        <button
          class="header-context"
          :class="{ active: activeSession?.contextClearedAt }"
          type="button"
          :disabled="isResponding"
          @click="openContextClearDialog"
        >
          {{ activeSession?.contextClearedAt ? '已清上下文' : '清上下文' }}
        </button>
        <button
          class="header-export"
          type="button"
          :disabled="!activeSession?.messages.length"
          @click="openExportDialog"
        >
          导出
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

            <div class="prompt-templates" aria-label="提示词模板">
              <button
                v-for="template in promptTemplates"
                :key="`project-${template.id}`"
                type="button"
                @click="applyPromptTemplate(template)"
              >
                <EditPen :size="14" />
                <span>{{ template.label }}</span>
              </button>
              <button class="manage-template-button" type="button" @click="openTemplateManager">
                <Setting :size="14" />
                <span>管理模板</span>
              </button>
            </div>

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
                  <h3>
                    {{ session.title }}
                    <small v-if="session.pinned" class="pin-mark project-pin">置顶</small>
                  </h3>
                  <p>{{ getResultPreview(session) }}</p>
                </div>
                <time>{{ formatTime(session.updatedAt) }}</time>
                <button class="home-row-action" type="button" aria-label="对话操作" @click.stop="toggleActionMenu(`home-session-${session.id}`, $event)">
                  <MoreFilled :size="17" />
                </button>
                <div v-if="openActionMenu === `home-session-${session.id}`" class="action-menu home-menu" :style="actionMenuStyle">
                  <button type="button" @click.stop="toggleProjectSessionPinned(session)">
                    <ChatDotRound :size="16" />
                    <span>{{ session.pinned ? '取消置顶' : '置顶对话' }}</span>
                  </button>
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
            <div class="prompt-templates" aria-label="提示词模板">
              <button
                v-for="template in promptTemplates"
                :key="`fresh-${template.id}`"
                type="button"
                @click="applyPromptTemplate(template)"
              >
                <EditPen :size="14" />
                <span>{{ template.label }}</span>
              </button>
              <button class="manage-template-button" type="button" @click="openTemplateManager">
                <Setting :size="14" />
                <span>管理模板</span>
              </button>
            </div>
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
                <div v-if="!isResponding" class="message-actions">
                  <button type="button" @click="copyMessage(message)">
                    复制
                  </button>
                  <button
                    v-if="message.role === 'user'"
                    type="button"
                    @click="startEditingMessage(message)"
                  >
                    编辑
                  </button>
                  <button
                    v-else-if="hasPreviousUserMessage(message)"
                    type="button"
                    @click="regenerateAssistantMessage(message)"
                  >
                    重新生成
                  </button>
                </div>
              </div>
              <div v-if="message.role === 'user' && editingMessageId === message.id" class="message-editor">
                <textarea v-model="editingDraft" rows="4" />
                <div class="message-editor-actions">
                  <button type="button" @click="submitEditedMessage(message)">发送</button>
                  <button type="button" @click="cancelEditingMessage">取消</button>
                </div>
              </div>
              <template v-else>
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
              </template>
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
          <div class="prompt-templates" aria-label="提示词模板">
            <button
              v-for="template in promptTemplates"
              :key="`panel-${template.id}`"
              type="button"
              @click="applyPromptTemplate(template)"
            >
              <EditPen :size="14" />
              <span>{{ template.label }}</span>
            </button>
            <button class="manage-template-button" type="button" @click="openTemplateManager">
              <Setting :size="14" />
              <span>管理模板</span>
            </button>
          </div>
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

    <div v-if="isContextClearOpen" class="confirm-overlay" @click.self="closeContextClearDialog">
      <section class="confirm-dialog" @click.stop>
        <header>
          <h2>清空上下文</h2>
          <button type="button" aria-label="关闭弹窗" @click="closeContextClearDialog">
            <Close :size="18" />
          </button>
        </header>
        <div class="confirm-body">
          <p>页面里的历史消息会保留，但下一次发送时，模型只会读取清空之后的新消息。</p>
          <strong>{{ activeSession?.title ?? '当前对话' }}</strong>
        </div>
        <footer>
          <button class="cancel-settings" type="button" @click="closeContextClearDialog">取消</button>
          <button class="confirm-primary" type="button" @click="clearCurrentContext">确认清空</button>
        </footer>
      </section>
    </div>

    <div v-if="isTemplateManagerOpen" class="confirm-overlay" @click.self="closeTemplateManager">
      <section class="template-dialog" @click.stop>
        <header>
          <div>
            <p>提示词模板</p>
            <h2>管理常用模板</h2>
          </div>
          <button type="button" aria-label="关闭模板管理" @click="closeTemplateManager">
            <Close :size="18" />
          </button>
        </header>
        <div class="template-body">
          <div class="template-list">
            <button
              v-for="template in promptTemplates"
              :key="`manage-${template.id}`"
              type="button"
              :class="{ active: editingTemplateId === template.id }"
              @click="editPromptTemplate(template)"
            >
              <span>{{ template.label }}</span>
              <small>{{ template.prompt }}</small>
            </button>
            <p v-if="promptTemplates.length === 0" class="template-empty">还没有模板。</p>
          </div>

          <div class="template-form">
            <label>
              <span>名称</span>
              <input v-model="draftTemplateLabel" placeholder="例如：代码审查" />
            </label>
            <label>
              <span>内容</span>
              <textarea
                v-model="draftTemplatePrompt"
                placeholder="输入插入到对话框里的提示词内容"
              />
            </label>
            <div class="template-form-actions">
              <button type="button" @click="resetTemplateDraft">新建</button>
              <button type="button" class="primary" @click="savePromptTemplate">
                {{ editingTemplateId ? '保存修改' : '新增模板' }}
              </button>
            </div>
          </div>
        </div>
        <footer>
          <button class="cancel-settings" type="button" @click="restoreDefaultTemplates">恢复默认</button>
          <button
            v-if="editingTemplateId"
            class="confirm-primary danger"
            type="button"
            @click="deletePromptTemplate(editingTemplateId)"
          >
            删除当前模板
          </button>
          <button class="confirm-primary" type="button" @click="closeTemplateManager">完成</button>
        </footer>
      </section>
    </div>

    <div v-if="isExportOpen" class="confirm-overlay" @click.self="closeExportDialog">
      <section class="export-dialog" @click.stop>
        <header>
          <div>
            <p>导出对话</p>
            <h2>{{ activeSession?.title ?? 'AI Chat 对话' }}</h2>
          </div>
          <button type="button" aria-label="关闭导出" @click="closeExportDialog">
            <Close :size="18" />
          </button>
        </header>
        <div class="export-body">
          <div class="export-mode">
            <button
              type="button"
              :class="{ active: exportMode === 'all' }"
              @click="exportMode = 'all'"
            >
              全部导出
            </button>
            <button
              type="button"
              :class="{ active: exportMode === 'selected' }"
              @click="exportMode = 'selected'"
            >
              选择消息
            </button>
          </div>

          <p class="export-summary">
            {{
              exportMode === 'all'
                ? `将导出全部 ${exportableMessages.length} 条消息。`
                : `将导出已选择的 ${selectedExportMessages.length} 条消息。`
            }}
          </p>

          <div v-if="exportMode === 'selected'" class="export-message-list">
            <button
              v-for="message in exportableMessages"
              :key="`export-${message.id}`"
              type="button"
              class="export-message-item"
              :class="{ selected: selectedExportMessageIds.includes(message.id) }"
              @click="toggleExportMessage(message.id)"
            >
              <span class="export-check" />
              <span>
                <strong>{{ message.role === 'assistant' ? 'AI Chat' : '你' }} · {{ formatTime(message.createdAt) }}</strong>
                <small>{{ getExportMessagePreview(message) }}</small>
              </span>
            </button>
          </div>
        </div>
        <footer>
          <button class="cancel-settings" type="button" @click="closeExportDialog">取消</button>
          <button class="confirm-primary" type="button" @click="exportCurrentSession">确认导出</button>
        </footer>
      </section>
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
          <section class="model-settings-panel">
            <h3>AI 参数</h3>
            <label>
              <span>temperature</span>
              <input
                v-model.number="draftModelSettings.temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
              />
            </label>
            <label>
              <span>max_tokens</span>
              <input
                v-model.number="draftModelSettings.maxTokens"
                type="number"
                min="0"
                max="8192"
                step="256"
                placeholder="0 表示自适应"
              />
            </label>
            <div class="default-tools">
              <label>
                <input v-model="draftModelSettings.defaultDeepThinking" type="checkbox" />
                <span>新对话默认深度思考</span>
              </label>
              <label>
                <input v-model="draftModelSettings.defaultWebSearch" type="checkbox" />
                <span>新对话默认联网搜索</span>
              </label>
              <label>
                <input v-model="draftModelSettings.defaultAgentMode" type="checkbox" />
                <span>新对话默认 Agent 模式</span>
              </label>
            </div>
          </section>
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
