import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import {
  MISSING_FINAL_ANSWER,
  splitReasoningFromAnswer,
  stripFinalAnswerMarker,
  useChatStore,
  type ChatMessage,
  type ChatSession,
  type WebSearchSource,
} from '@/stores/chat'
import { useAppSettings } from '@/composables/useAppSettings'
import { useChatSearch } from '@/composables/useChatSearch'
import { useConversationTransfer } from '@/composables/useConversationTransfer'
import { useFavorites } from '@/composables/useFavorites'
import { useGlobalInteractions } from '@/composables/useGlobalInteractions'
import { useMessageBranches } from '@/composables/useMessageBranches'
import { useProjectManagement } from '@/composables/useProjectManagement'
import { usePromptTemplates } from '@/composables/usePromptTemplates'
import { useReasoningDisplay } from '@/composables/useReasoningDisplay'
import type { ModelSettings, PromptTemplate } from '@/types/ui'

export const useChatApp = () => {
interface AppSendOptions {
  agentMode: boolean
  branchLabel?: string
  branchOf?: string
  deepThinking: boolean
  maxTokens?: number
  temperature: number
  webSearch: boolean
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
const LEGACY_WELCOME_CONTENT = '你好，我是你的 AI 助手。可以帮你整理想法、写代码、润色文案，或者陪你拆解一个复杂问题。'
const MOBILE_BREAKPOINT = 780

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
const editingMessageId = ref('')
const editingDraft = ref('')
const isMobileViewport = ref(
  typeof window !== 'undefined' && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches,
)
const isSidebarCollapsed = ref(isMobileViewport.value)
const isContextClearOpen = ref(false)
const isProjectsOpen = ref(true)
const isRecentOpen = ref(true)
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
const liveNow = ref(Date.now())
const activeMessageId = ref('')
const highlightedMessageId = ref('')
const hoveredNavigatorItem = ref<{ label: string; right: number; top: number } | null>(null)
const openActionMenu = ref('')
const projectSessions = ref<Record<string, ChatSession[]>>({})
const projectDescriptions = ref<Record<string, string>>(storedAppState.projectDescriptions ?? {})
const projects = ref<string[]>(storedAppState.projects ?? [])
let projectAbortController: AbortController | null = null
let liveTimer: number | undefined
let searchHighlightTimer: number | undefined

const createId = () => crypto.randomUUID()
const {
  avatarImage,
  closeSettings,
  draftModelSettings,
  draftProfileName,
  draftThemeMode,
  handleAvatarUpload,
  isAgentMode,
  isDeepThinking,
  isSettingsOpen,
  isWebSearch,
  modelSettings,
  openSettings,
  persistToolState,
  profileName,
  saveSettings,
  savedAvatarDisplay,
  themeMode,
  toggleAgentMode,
  toggleDeepThinking,
  toggleWebSearch,
} = useAppSettings({
  avatarImage: storedAppState.avatarImage,
  closeMobileSidebar: () => closeMobileSidebar(),
  modelSettings: storedAppState.modelSettings,
  profileName: storedAppState.profileName,
  storedAgentMode: storedToolState.agentMode,
  storedWebSearch: storedToolState.webSearch,
  themeMode: storedAppState.themeMode,
})
const {
  applyPromptTemplate,
  closeTemplateManager,
  deletePromptTemplate,
  draftTemplateLabel,
  draftTemplatePrompt,
  editingTemplateId,
  editPromptTemplate,
  isTemplateManagerOpen,
  openTemplateManager,
  promptTemplates,
  resetTemplateDraft,
  restoreDefaultTemplates,
  savePromptTemplate,
} = usePromptTemplates(draft, storedAppState.promptTemplates, createId)

const summarizeTitle = (content: string) => {
  const normalized = content
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(?:请|麻烦|帮我|请帮我|能不能|可以|可以帮我)?\s*(?:详细)?(?:解释|介绍|分析|说明|说说|聊聊|总结|写|生成|润色|翻译|优化)(?:一下|下|一下子)?\s*[：:，,。.]?\s*/i, '')
    .replace(/^(?:关于|有关|对于)\s*/, '')
    .replace(/^(?:什么是|什么叫|如何|怎么|怎样)\s*/, '')
    .trim()
  const fallback = content.trim().replace(/\s+/g, ' ')
  const title = normalized || fallback

  return title.length > 18 ? `${title.slice(0, 18)}...` : title || '新的对话'
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
const {
  getAnswerContent,
  getReasoningContent,
  getReasoningLabel,
  isReasoningOpen,
  toggleReasoning,
} = useReasoningDisplay({
  isResponding,
  liveNow,
  streamingMessageId: streamingAssistantMessageId,
  streamingReasoningContent,
  streamingReasoningEndedAt,
  streamingReasoningStartedAt,
})

projectSessions.value = normalizeProjectSessions(storedAppState.projectSessions ?? {})

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

const {
  getBranchSwitcher,
  revealMessageBranch,
  selectBranch,
  visibleMessages,
} = useMessageBranches({
  activeSession,
  isProjectMode,
  persistAppState: () => persistAppState(),
  persistChatSessions: () => persistChatSessions(),
  updateActiveMessageFromScroll: () => updateActiveMessageFromScroll(),
})

const messageNavigatorItems = computed(() =>
  visibleMessages.value
    .filter((message) => message.role === 'user')
    .map((message, index) => ({
      id: message.id,
      fullLabel: getNavigatorFullLabel(message.content, index),
      label: getNavigatorLabel(message.content, index),
      role: message.role,
    })),
)

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
  revealMessageBranch(messageId)
  await nextTick()
  const row = messagesRef.value?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`)
  if (!row) return

  row.scrollIntoView({ behavior: 'smooth', block: 'center' })
  activeMessageId.value = messageId
  highlightedMessageId.value = messageId
  if (searchHighlightTimer !== undefined) {
    window.clearTimeout(searchHighlightTimer)
  }
  searchHighlightTimer = window.setTimeout(() => {
    highlightedMessageId.value = ''
    searchHighlightTimer = undefined
  }, 1600)
}

const copyRenderedCode = async (event: MouseEvent) => {
  const target = event.target as HTMLElement
  const missingCitation = target.closest<HTMLAnchorElement>('.citation-missing')
  if (missingCitation) {
    event.preventDefault()
    ElMessage.info('接口没有返回这条引用的来源链接')
    return
  }

  const copyButton = target.closest<HTMLButtonElement>('.code-copy')
  if (!copyButton) return

  const code = copyButton.parentElement?.querySelector('code')?.textContent ?? ''
  if (!code) return

  await navigator.clipboard.writeText(code)
  ElMessage.success('已复制代码')
}

const getMessagePlainText = (message: ChatMessage) => {
  if (message.role === 'assistant') return getAnswerContent(message)

  return message.content
}

const {
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
} = useConversationTransfer({
  activeProject,
  activeProjectSessionId,
  activeSession,
  chatSessions: chatStore.sessions,
  createId,
  currentMode,
  getMessagePlainText,
  isPendingNewSession,
  isPendingProjectSession,
  isProjectHome,
  persistChatSessions,
  scrollToBottom,
  stopResponding: () => chatStore.stopResponding(),
  switchSession: (sessionId) => chatStore.switchSession(sessionId),
})

const {
  closeFavoritesManager,
  favoriteResults,
  favoriteScope,
  favoriteScopeOptions,
  favoriteSearchText,
  filteredFavoriteResults,
  isFavoritesOpen,
  openFavoritesManager,
  removeFavorite,
  switchFromFavorite,
  toggleMessageFavorite,
} = useFavorites({
  activeProject,
  activeProjectSessionId,
  activeSession,
  chatSessions: chatStore.sessions,
  closeMobileSidebar: () => closeMobileSidebar(),
  currentMode,
  getMessagePlainText,
  isPendingNewSession,
  isPendingProjectSession,
  isProjectHome,
  isProjectMode,
  jumpToMessage,
  persistAppState,
  persistChatSessions,
  projectSessions,
  stopResponding: () => chatStore.stopResponding(),
  switchSession: (sessionId) => chatStore.switchSession(sessionId),
})

const {
  closeSearch,
  closeSessionSearch,
  getResultPreview,
  isSearchOpen,
  isSessionSearchOpen,
  openSearch,
  openSessionSearch,
  searchResults,
  searchText,
  sessionSearchResults,
  sessionSearchText,
  switchFromSearch,
  switchFromSessionSearch,
} = useChatSearch({
  activeProject,
  activeProjectSessionId,
  activeSession,
  chatSessions: chatStore.sessions,
  closeMobileSidebar: () => closeMobileSidebar(),
  currentMode,
  getMessagePlainText,
  isPendingNewSession,
  isPendingProjectSession,
  isProjectHome,
  isProjectMode,
  jumpToMessage,
  projectSessions,
  scrollToBottom,
  stopResponding: () => chatStore.stopResponding(),
  switchSession: (sessionId) => chatStore.switchSession(sessionId),
})

const copyMessage = async (message: ChatMessage) => {
  const content = getMessagePlainText(message).trim()
  if (!content) return

  await navigator.clipboard.writeText(content)
  ElMessage.success('已复制消息')
}

const isToolButtonPressed = (tool: string) => {
  if (typeof document === 'undefined') return false

  return Boolean(document.querySelector(`.composer-tools button[data-tool="${tool}"][aria-pressed="true"]`))
}

const getSendOptions = (): AppSendOptions => ({
  agentMode: isAgentMode.value || isToolButtonPressed('agent-mode'),
  deepThinking: isDeepThinking.value || isToolButtonPressed('deep-thinking'),
  maxTokens: modelSettings.value.maxTokens || undefined,
  temperature: modelSettings.value.temperature,
  webSearch: isWebSearch.value || isToolButtonPressed('web-search'),
})

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

  const userMessage = session.messages[messageIndex]
  if (!userMessage) return

  const content = (nextContent ?? userMessage.content).trim()
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

const cloneMessageForBranch = (message: ChatMessage): ChatMessage => ({
  id: createId(),
  role: message.role,
  content: message.content,
  reasoningContent: message.reasoningContent,
  reasoningEndedAt: message.reasoningEndedAt,
  reasoningStartedAt: message.reasoningStartedAt,
  sources: message.sources?.map((source) => ({ ...source })),
  createdAt: message.createdAt,
})

const createBranchedSession = async (sourceMessage: ChatMessage, content: string) => {
  const parentSession = activeSession.value
  if (!parentSession || isResponding.value) return

  const sourceIndex = visibleMessages.value.findIndex((message) => message.id === sourceMessage.id)
  if (sourceIndex < 0) return

  const branchSession: ChatSession = {
    branchDepth: (parentSession.branchDepth ?? 0) + 1,
    branchParentSessionId: parentSession.id,
    branchParentTitle: parentSession.title,
    branchRootSessionId: parentSession.branchRootSessionId ?? parentSession.id,
    branchSourceMessageId: sourceMessage.id,
    id: `branch-${createId()}`,
    title: summarizeTitle(content),
    messages: visibleMessages.value.slice(0, sourceIndex).map(cloneMessageForBranch),
    updatedAt: Date.now(),
  }
  const sendOptions = getSendOptions()

  if (isProjectMode.value && activeProject.value) {
    const projectName = activeProject.value
    projectSessions.value = {
      ...projectSessions.value,
      [projectName]: [branchSession, ...(projectSessions.value[projectName] ?? [])],
    }
    activeProjectSessionId.value = branchSession.id
    isProjectHome.value = false
    isPendingProjectSession.value = false
    persistAppState()
    ElMessage.success('已在新聊天中创建分支')
    await sendProjectContent(content, sendOptions)
    return
  }

  chatStore.sessions.unshift(branchSession)
  chatStore.switchSession(branchSession.id)
  currentMode.value = 'chat'
  activeProject.value = ''
  activeProjectSessionId.value = ''
  isProjectHome.value = false
  isPendingNewSession.value = false
  isPendingProjectSession.value = false
  persistChatSessions()
  ElMessage.success('已在新聊天中创建分支')
  await chatStore.sendMessage(content, sendOptions)
}

const branchFromAssistantMessage = async (sourceMessage: ChatMessage) => {
  const parentSession = activeSession.value
  if (!parentSession || isResponding.value || sourceMessage.role !== 'assistant') return

  const sourceIndex = visibleMessages.value.findIndex((message) => message.id === sourceMessage.id)
  if (sourceIndex < 0) return

  const branchSession: ChatSession = {
    branchDepth: (parentSession.branchDepth ?? 0) + 1,
    branchParentSessionId: parentSession.id,
    branchParentTitle: parentSession.title,
    branchRootSessionId: parentSession.branchRootSessionId ?? parentSession.id,
    branchSourceMessageId: sourceMessage.id,
    id: `branch-${createId()}`,
    title: parentSession.title,
    messages: visibleMessages.value.slice(0, sourceIndex + 1).map(cloneMessageForBranch),
    updatedAt: Date.now(),
  }

  if (isProjectMode.value && activeProject.value) {
    const projectName = activeProject.value
    projectSessions.value = {
      ...projectSessions.value,
      [projectName]: [branchSession, ...(projectSessions.value[projectName] ?? [])],
    }
    activeProjectSessionId.value = branchSession.id
    isProjectHome.value = false
    isPendingProjectSession.value = false
    persistAppState()
  } else {
    chatStore.sessions.unshift(branchSession)
    chatStore.switchSession(branchSession.id)
    currentMode.value = 'chat'
    activeProject.value = ''
    activeProjectSessionId.value = ''
    isProjectHome.value = false
    isPendingNewSession.value = false
    isPendingProjectSession.value = false
    persistChatSessions()
  }

  ElMessage.success('已从这条回答创建新聊天分支')
  await focusDraftInput()
}

const submitEditedMessage = async (message: ChatMessage) => {
  const content = editingDraft.value.trim()
  if (!content) return

  cancelEditingMessage()
  await createBranchedSession(message, content)
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
  event: Event,
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

const closeMobileSidebar = () => {
  if (isMobileViewport.value) isSidebarCollapsed.value = true
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

const sendProjectContent = async (content: string, sendOptions: AppSendOptions = getSendOptions()) => {
  const session = activeProjectSession.value
  const trimmedContent = content.trim()
  if (!session || !trimmedContent || isProjectResponding.value) return

  const now = Date.now()
  const branchSourceIndex = sendOptions.branchOf
    ? session.messages.findIndex((message) => message.id === sendOptions.branchOf)
    : -1
  const userMessage: ChatMessage = {
    branchLabel: sendOptions.branchLabel,
    branchOf: sendOptions.branchOf,
    id: createId(),
    role: 'user',
    content: trimmedContent,
    createdAt: now,
  }
  session.messages.push(userMessage)
  if (sendOptions.branchOf) {
    session.activeBranchIds = {
      ...(session.activeBranchIds ?? {}),
      [sendOptions.branchOf]: userMessage.id,
    }
  }

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
  let responseSources: WebSearchSource[] = []
  const ensureProjectAssistantMessage = () => {
    if (!assistantMessage) {
      assistantMessage = {
        branchLabel: sendOptions.branchLabel,
        branchOf: sendOptions.branchOf,
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

  const contextMessages =
    branchSourceIndex >= 0 ? [...session.messages.slice(0, branchSourceIndex), userMessage] : session.messages

  const reply = await chatStore.requestAssistantReply(contextMessages, {
    agentMode: sendOptions.agentMode,
    contextClearedAt: session.contextClearedAt,
    deepThinking: sendOptions.deepThinking,
    maxTokens: sendOptions.maxTokens,
    temperature: sendOptions.temperature,
    webSearch: sendOptions.webSearch,
    onSources: (sources) => {
      responseSources = sources
      const message = assistantMessage as ChatMessage | null
      if (message) message.sources = sources
    },
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

  const completedAssistantMessage = assistantMessage as ChatMessage | null
  if (completedAssistantMessage) {
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
      reasoningStartedAt = completedAssistantMessage.createdAt
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
      reasoningStartedAt = reasoningStartedAt || completedAssistantMessage.createdAt
      reasoningEndedAt = reasoningEndedAt || Date.now()
    } else if (finalReasoning.trim() && !finalContent.trim()) {
      finalContent = MISSING_FINAL_ANSWER
    }

    completedAssistantMessage.content = finalContent
    completedAssistantMessage.reasoningContent = finalReasoning || undefined
    completedAssistantMessage.reasoningStartedAt = reasoningStartedAt || undefined
    completedAssistantMessage.reasoningEndedAt = reasoningEndedAt || undefined
    completedAssistantMessage.sources = responseSources.length ? responseSources : undefined
  } else if (reply) {
    const fallbackSplit = sendOptions.deepThinking ? splitReasoningFromAnswer(reply) : null
    const createdAt = Date.now()
    assistantMessage = {
      branchLabel: sendOptions.branchLabel,
      branchOf: sendOptions.branchOf,
      id: createId(),
      role: 'assistant',
      content: fallbackSplit?.answer ?? reply,
      reasoningContent: fallbackSplit?.reasoning,
      reasoningEndedAt: fallbackSplit ? createdAt : undefined,
      reasoningStartedAt: fallbackSplit ? createdAt : undefined,
      sources: responseSources.length ? responseSources : undefined,
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

const {
  actionDialog,
  actionMenuStyle,
  closeActionDialog,
  confirmActionDialog,
  createProjectSession,
  createSession,
  deleteProject,
  deleteSession,
  openCreateProjectDialog,
  renameProject,
  renameSession,
  selectChatSession,
  selectProject,
  sendProjectMessage,
  switchProjectSession,
  toggleActionMenu,
} = useProjectManagement({
  activeProject,
  activeProjectSessionId,
  chatSessions: chatStore.sessions,
  closeMobileSidebar: () => closeMobileSidebar(),
  createId,
  currentMode,
  deleteChatSession: (sessionId) => chatStore.deleteSession(sessionId),
  draft,
  getSendOptions,
  isPendingNewSession,
  isPendingProjectSession,
  isProjectHome,
  isProjectsOpen,
  openActionMenu,
  projectDescriptions,
  projects,
  projectSessions,
  renameChatSession: (sessionId, title) => chatStore.renameSession(sessionId, title),
  resetTools: () => {
    isDeepThinking.value = modelSettings.value.defaultDeepThinking
    isAgentMode.value = modelSettings.value.defaultAgentMode
    isWebSearch.value = modelSettings.value.defaultWebSearch
    persistToolState()
  },
  scrollToBottom,
  sendProjectContent,
  stopResponding: () => stopResponding(),
  switchChatSession: (sessionId) => chatStore.switchSession(sessionId),
})

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

const { focusDraftInput } = useGlobalInteractions({
  actionDialog,
  closeActionDialog,
  closeContextClearDialog,
  closeExportDialog,
  closeFavoritesManager,
  closeSearch,
  closeSessionSearch,
  closeSettings,
  closeTemplateManager,
  hasDraft,
  isContextClearOpen,
  isExportOpen,
  isFavoritesOpen,
  isMobileViewport,
  isProjectHome,
  isProjectMode,
  isResponding,
  isSearchOpen,
  isSessionSearchOpen,
  isSettingsOpen,
  isSidebarCollapsed,
  isTemplateManagerOpen,
  openActionMenu,
  openSearch,
  send,
  sendProjectMessage,
})

onBeforeUnmount(() => {
  if (liveTimer !== undefined) {
    window.clearInterval(liveTimer)
  }
  if (searchHighlightTimer !== undefined) {
    window.clearTimeout(searchHighlightTimer)
  }
})

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)

  return {
    chatStore,
    draft,
    messagesRef,
    editingMessageId,
    editingDraft,
    isMobileViewport,
    isSidebarCollapsed,
    isSearchOpen,
    isSessionSearchOpen,
    isExportOpen,
    isFavoritesOpen,
    isTemplateManagerOpen,
    isContextClearOpen,
    searchText,
    sessionSearchText,
    favoriteSearchText,
    favoriteScope,
    isProjectsOpen,
    isRecentOpen,
    isSettingsOpen,
    activeProject,
    isProjectHome,
    isPendingNewSession,
    isPendingProjectSession,
    draftModelSettings,
    isDeepThinking,
    isAgentMode,
    isWebSearch,
    exportMode,
    selectedExportMessageIds,
    editingTemplateId,
    draftTemplateLabel,
    draftTemplatePrompt,
    activeMessageId,
    highlightedMessageId,
    hoveredNavigatorItem,
    openActionMenu,
    actionMenuStyle,
    actionDialog,
    projectDescriptions,
    profileName,
    draftProfileName,
    avatarImage,
    themeMode,
    draftThemeMode,
    promptTemplates,
    activeSession,
    isFreshSession,
    isProjectMode,
    isResponding,
    isWaitingForFirstToken,
    streamingAssistantMessageId,
    streamingAssistantMessageContent,
    headerSessionTitle,
    projects,
    searchResults,
    sessionSearchResults,
    sidebarSessions,
    activeProjectSessions,
    favoriteResults,
    visibleMessages,
    favoriteScopeOptions,
    filteredFavoriteResults,
    messageNavigatorItems,
    exportableMessages,
    selectedExportMessages,
    savedAvatarDisplay,
    updateActiveMessageFromScroll,
    jumpToMessage,
    copyRenderedCode,
    getReasoningContent,
    getAnswerContent,
    getBranchSwitcher,
    selectBranch,
    copyMessage,
    toggleMessageFavorite,
    switchFromFavorite,
    openFavoritesManager,
    closeFavoritesManager,
    removeFavorite,
    openExportDialog,
    closeExportDialog,
    toggleExportMessage,
    getExportMessagePreview,
    exportCurrentSession,
    importMarkdownSession,
    isReasoningOpen,
    toggleReasoning,
    getReasoningLabel,
    toggleDeepThinking,
    toggleAgentMode,
    toggleWebSearch,
    applyPromptTemplate,
    resetTemplateDraft,
    openTemplateManager,
    closeTemplateManager,
    editPromptTemplate,
    savePromptTemplate,
    deletePromptTemplate,
    restoreDefaultTemplates,
    openContextClearDialog,
    closeContextClearDialog,
    clearCurrentContext,
    toggleChatSessionPinned,
    toggleProjectSessionPinned,
    startEditingMessage,
    cancelEditingMessage,
    hasPreviousUserMessage,
    branchFromAssistantMessage,
    submitEditedMessage,
    regenerateAssistantMessage,
    showNavigatorTooltip,
    hideNavigatorTooltip,
    send,
    stopResponding,
    openSearch,
    closeSearch,
    openSessionSearch,
    closeSessionSearch,
    switchFromSearch,
    switchFromSessionSearch,
    getResultPreview,
    createSession,
    selectProject,
    switchProjectSession,
    selectChatSession,
    sendProjectMessage,
    toggleActionMenu,
    openCreateProjectDialog,
    renameProject,
    deleteProject,
    renameSession,
    deleteSession,
    closeActionDialog,
    confirmActionDialog,
    handleAvatarUpload,
    openSettings,
    saveSettings,
    closeSettings,
    formatTime,
  }
}
