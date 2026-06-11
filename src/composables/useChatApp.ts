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
import type { MemoryItem, ModelSettings, PromptTemplate } from '@/types/ui'

// composable 是普通函数，不是组件实例；它通过闭包保存状态并返回给调用方。
// 相比 Vue 2 mixin，状态来源和依赖都能从参数、返回值中明确看出来。
// 应用级编排层：组合各功能 composable，并统一普通会话与项目会话的状态。
export const useChatApp = () => {
// 这些 interface 只在 TypeScript 编译阶段用于检查参数，打包后的浏览器代码里不存在。
interface AppSendOptions {
  agentMode: boolean
  branchLabel?: string
  branchOf?: string
  deepThinking: boolean
  maxTokens?: number
  systemPrompt?: string
  temperature: number
  webSearch: boolean
}

interface PersistedAppState {
  // 可选字段 ? 用于兼容旧版本 localStorage：旧数据里可能还没有后来新增的设置。
  activeProject?: string
  activeProjectSessionId?: string
  avatarImage?: string
  customInstructions?: string
  memories?: MemoryItem[]
  modelSettings?: ModelSettings
  profileName?: string
  currentMode?: 'chat' | 'project'
  isProjectHome?: boolean
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

// 清理旧版本欢迎消息和异常中断留下的空白助手消息。
const normalizeMessages = (messages: ChatMessage[]) =>
  messages.filter(
    (message, index) =>
      !(index === 0 && message.role === 'assistant' && message.content === LEGACY_WELCOME_CONTENT) &&
      !(message.role === 'assistant' && !message.content.trim() && !message.error),
  )

const normalizeProjectSessions = (sessions: Record<string, ChatSession[]>) =>
  // Object.entries 把对象转换为 [键, 值] 数组，处理后再由 Object.fromEntries 还原成对象。
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
    // JSON.parse 只恢复普通对象，不会恢复 ref/computed；响应式会在下面重新创建。
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

// useChatStore() 获取 Pinia 中 id 为 chat 的共享 store。
// 其他组件再次调用时会拿到同一个状态实例，而不是重新创建一份。
const chatStore = useChatStore()
const storedAppState = readAppState()
const storedToolState = readToolState()
// 页面模式和项目内位置需要一起恢复，否则刷新项目首页时会误落到普通对话。
const storedMode =
  storedAppState.currentMode === 'project' && storedAppState.activeProject
    ? 'project'
    : 'chat'

// 页面状态：包含导航位置、弹窗、编辑态和长对话渲染窗口。
// ref 相当于把 Vue 2 data 中的单个字段变成独立响应式对象。
// TypeScript 中读写用 draft.value，模板使用时会自动解包为 draft。
const draft = ref('')
const messagesRef = ref<HTMLElement | null>(null)
const editingMessageId = ref('')
const editingDraft = ref('')
const isMobileViewport = ref(
  // typeof window 防止代码在非浏览器环境执行时直接访问 window 报错。
  typeof window !== 'undefined' && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches,
)
const isSidebarCollapsed = ref(isMobileViewport.value)
const isContextClearOpen = ref(false)
const isConversationManagerOpen = ref(false)
const conversationManagerMode = ref<'archived' | 'trash'>('archived')
const isProjectsOpen = ref(true)
const isRecentOpen = ref(true)
const activeProject = ref(storedMode === 'project' ? storedAppState.activeProject ?? '' : '')
const currentMode = ref<'chat' | 'project'>(storedMode)
const isProjectHome = ref(
  storedMode === 'project'
    ? storedAppState.isProjectHome ?? !storedAppState.activeProjectSessionId
    : false,
)
const isPendingNewSession = ref(false)
const isPendingProjectSession = ref(false)
const activeProjectSessionId = ref(
  storedMode === 'project' ? storedAppState.activeProjectSessionId ?? '' : '',
)
const isProjectResponding = ref(false)
const projectStreamingMessageContent = ref('')
const projectStreamingMessageId = ref('')
const projectStreamingReasoningContent = ref('')
const projectStreamingReasoningEndedAt = ref(0)
const projectStreamingReasoningStartedAt = ref(0)
const liveNow = ref(Date.now())
const activeMessageId = ref('')
const messageRenderLimit = ref(80)
const highlightedMessageId = ref('')
const hoveredNavigatorItem = ref<{ label: string; right: number; top: number } | null>(null)
const openActionMenu = ref('')
// Record<string, ChatSession[]> 表示键是项目名、值是该项目的会话数组。
const projectSessions = ref<Record<string, ChatSession[]>>({})
const projectDescriptions = ref<Record<string, string>>(storedAppState.projectDescriptions ?? {})
const projects = ref<string[]>(storedAppState.projects ?? [])
// AbortController 是请求控制器，不需要参与页面渲染，因此使用普通变量而不是 ref。
let projectAbortController: AbortController | null = null
let continuationAbortController: AbortController | null = null
let liveTimer: number | undefined
let searchHighlightTimer: number | undefined

const createId = () => crypto.randomUUID()

// 设置、模板等独立功能在这里接入，useChatApp 只负责跨模块协调。
// ===== Settings and reusable input tools =====
const {
  addDraftMemory,
  avatarImage,
  closeSettings,
  customInstructions,
  draftCustomInstructions,
  draftMemories,
  draftMemory,
  draftModelSettings,
  draftProfileName,
  draftThemeMode,
  handleAvatarUpload,
  isAgentMode,
  isDeepThinking,
  isSettingsOpen,
  isWebSearch,
  memories,
  modelSettings,
  openSettings,
  persistToolState,
  profileName,
  removeDraftMemory,
  saveSettings,
  savedAvatarDisplay,
  themeMode,
  toggleAgentMode,
  toggleDeepThinking,
  toggleWebSearch,
} = useAppSettings({
  // 这里采用依赖注入：设置模块只接收需要的数据和回调，不直接依赖整个 useChatApp。
  avatarImage: storedAppState.avatarImage,
  closeMobileSidebar: () => closeMobileSidebar(),
  customInstructions: storedAppState.customInstructions,
  memories: storedAppState.memories,
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
// draft Ref 被直接传给模板模块；应用模板时修改的是同一个输入框状态。

// ===== Display labels and active session selection =====
// 自动标题只用于侧边栏摘要，不会修改用户输入的原始消息。
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
  // 折叠导航只展示短标签，完整内容由悬浮提示展示。
  const normalized = content.trim().replace(/\s+/g, ' ')

  if (!normalized) return `对话 ${index + 1}`

  return normalized.length > 22 ? `${normalized.slice(0, 22)}...` : normalized
}

const getNavigatorFullLabel = (content: string, index: number) => {
  // 空问题仍提供稳定的兜底名称，保证导航项可识别。
  const normalized = content.trim().replace(/\s+/g, ' ')

  return normalized || `对话 ${index + 1}`
}

// computed 与 Vue 2 computed 作用相同：依赖的 ref 变化后才重新计算，并缓存结果。
const activeProjectSession = computed(() => {
  // 项目首页没有 activeProjectSessionId，因此这里允许返回 undefined。
  if (!activeProject.value || !activeProjectSessionId.value) return undefined
  return projectSessions.value[activeProject.value]?.find((session) => session.id === activeProjectSessionId.value)
})

// 项目模式下不回退到普通聊天，避免左侧选中项目、右侧却展示普通会话。
const activeSession = computed(() =>
  // computed 返回 ComputedRef，不能直接赋值；它的值完全由当前模式和底层会话推导。
  currentMode.value === 'project' ? activeProjectSession.value : chatStore.activeSession,
)
// 输入框只判断去除空白后是否有内容。
const hasDraft = computed(() => draft.value.trim().length > 0)
// 临时新建态与真正的空 session 在视觉上都使用欢迎页。
const isFreshSession = computed(
  () => isPendingNewSession.value || isPendingProjectSession.value || (activeSession.value?.messages.length ?? 0) === 0,
)
// activeProject 是项目模式成立的必要条件，防止残留 mode 产生假项目页。
const isProjectMode = computed(() => currentMode.value === 'project' && Boolean(activeProject.value))
// 普通和项目请求只能有一类处于生成态，但模板统一消费同一个值。
const isResponding = computed(() => chatStore.isResponding || isProjectResponding.value)
// 助手消息延迟创建，最后一条仍是用户消息时显示“正在生成”占位。
const isWaitingForFirstToken = computed(() => isResponding.value && activeSession.value?.messages.at(-1)?.role === 'user')
// 以下流式字段把普通会话 Store 和项目本地状态适配为统一接口。
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
  // 临时新会话不沿用 Store 自动回退到的旧会话标题。
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

// ===== Restore persisted navigation safely =====
projectSessions.value = normalizeProjectSessions(storedAppState.projectSessions ?? {})

// localStorage 可能残留已删除的项目或会话，恢复时先降级到仍然有效的页面。
if (currentMode.value === 'project') {
  const projectExists = projects.value.includes(activeProject.value)
  const restoredSession = activeProjectSessionId.value
    ? projectSessions.value[activeProject.value]?.find(
        (session) =>
          session.id === activeProjectSessionId.value &&
          !session.archivedAt &&
          !session.deletedAt,
      )
    : undefined

  if (!projectExists) {
    currentMode.value = 'chat'
    activeProject.value = ''
    activeProjectSessionId.value = ''
    isProjectHome.value = false
  } else if (!restoredSession) {
    activeProjectSessionId.value = ''
    isProjectHome.value = true
  } else {
    isProjectHome.value = false
  }
}

const sortSessions = (sessions: ChatSession[]) =>
  // 置顶优先，同一分组内再按最后更新时间倒序。
  [...sessions].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1

    return right.updatedAt - left.updatedAt
  })

const sidebarSessions = computed(() =>
  // 归档和回收站内容只能从管理弹窗访问。
  sortSessions(chatStore.sessions.filter((session) => !session.archivedAt && !session.deletedAt)),
)

const activeProjectSessions = computed(() => {
  // 项目首页只展示当前项目中的可见会话。
  if (!activeProject.value) return []

  return sortSessions(
    (projectSessions.value[activeProject.value] ?? []).filter(
      (session) => !session.archivedAt && !session.deletedAt,
    ),
  )
})

const managedConversations = computed(() => [
  // 管理弹窗需要同时展示普通会话和各项目中的会话。
  ...chatStore.sessions.map((session) => ({ projectName: '', session })),
  ...Object.entries(projectSessions.value).flatMap(([projectName, sessions]) =>
    sessions.map((session) => ({ projectName, session })),
  ),
])
// 上面使用数组展开，把普通会话和各项目会话转换成同一种 { projectName, session } 结构，
// 后面的归档/回收站代码就不需要分别写两套过滤逻辑。

const archivedConversations = computed(() =>
  // 已进入回收站的会话不再同时出现在归档列表。
  managedConversations.value
    .filter((item) => item.session.archivedAt && !item.session.deletedAt)
    .map((item) => ({ ...item, timestamp: item.session.archivedAt ?? item.session.updatedAt }))
    .sort((left, right) => right.timestamp - left.timestamp),
)

const trashedConversations = computed(() =>
  // 回收站按删除时间排序，而不是按最后聊天时间排序。
  managedConversations.value
    .filter((item) => item.session.deletedAt)
    .map((item) => ({ ...item, timestamp: item.session.deletedAt ?? item.session.updatedAt }))
    .sort((left, right) => right.timestamp - left.timestamp),
)

const managedConversationItems = computed(() =>
  // 弹窗只接收当前标签页对应的一份列表。
  conversationManagerMode.value === 'archived'
    ? archivedConversations.value
    : trashedConversations.value,
)

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

// ===== Long conversation rendering and navigation =====
const renderedMessages = computed(() =>
  // 长会话只渲染尾部窗口，用户主动加载时再向前扩展。
  visibleMessages.value.slice(-messageRenderLimit.value),
)
const hiddenMessageCount = computed(() =>
  // 该数量用于“加载更早消息”按钮，不等于底层 session 的总消息差。
  Math.max(0, visibleMessages.value.length - renderedMessages.value.length),
)

const loadEarlierMessages = async () => {
  const element = messagesRef.value
  // 先记住插入旧消息前的总高度。
  const previousHeight = element?.scrollHeight ?? 0
  messageRenderLimit.value += 80
  // 等待新增消息真正渲染到 DOM，才能读取新的 scrollHeight。
  await nextTick()
  // 补入旧消息后抵消新增高度，让用户仍停留在原来的阅读位置。
  if (element) element.scrollTop += element.scrollHeight - previousHeight
}

const messageNavigatorItems = computed(() =>
  // 一轮会话以用户问题为锚点，助手回答不单独占导航项。
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
  // 项目、外观和应用导航位置共用一份快照；普通会话由 Pinia store 单独保存。
  const state: PersistedAppState = {
    activeProject: activeProject.value,
    activeProjectSessionId: activeProjectSessionId.value,
    avatarImage: avatarImage.value,
    customInstructions: customInstructions.value,
    memories: memories.value,
    currentMode: currentMode.value,
    isProjectHome: isProjectHome.value,
    modelSettings: modelSettings.value,
    profileName: profileName.value,
    promptTemplates: promptTemplates.value,
    projectDescriptions: projectDescriptions.value,
    projects: projects.value,
    projectSessions: projectSessions.value,
    themeMode: themeMode.value,
  }

  try {
    // ref/computed 不能直接存入 localStorage，所以快照中只放 .value 取出的普通数据。
    window.localStorage?.setItem(APP_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

const persistChatSessions = () => {
  // 普通会话沿用 Store 的存储键；这里用于外层直接修改消息后的补充保存。
  try {
    window.localStorage?.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatStore.sessions))
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

const openConversationManager = () => {
  // 移动端打开弹窗前收起抽屉，避免关闭弹窗后仍遮住主内容。
  isConversationManagerOpen.value = true
  if (isMobileViewport.value) isSidebarCollapsed.value = true
}

const closeConversationManager = () => {
  isConversationManagerOpen.value = false
}

const restoreManagedConversation = (item: { projectName: string; session: ChatSession }) => {
  // 恢复会同时清除归档和删除标记，回到普通可见列表。
  item.session.archivedAt = undefined
  item.session.deletedAt = undefined
  item.session.updatedAt = Date.now()
  if (item.projectName) persistAppState()
  else chatStore.restoreSession(item.session.id)
  ElMessage.success('对话已恢复')
}

const trashManagedConversation = (item: { projectName: string; session: ChatSession }) => {
  // 从归档移入回收站时两个软状态互斥。
  item.session.archivedAt = undefined
  item.session.deletedAt = Date.now()
  item.session.updatedAt = Date.now()
  if (item.projectName) persistAppState()
  else chatStore.trashSession(item.session.id)
  ElMessage.success('已移到回收站')
}

const removeManagedConversation = (item: { projectName: string; session: ChatSession }) => {
  // 彻底删除才从数组移除；项目与普通会话使用各自持久化路径。
  if (item.projectName) {
    projectSessions.value[item.projectName] = (projectSessions.value[item.projectName] ?? []).filter(
      (session) => session.id !== item.session.id,
    )
    persistAppState()
  } else {
    chatStore.deleteSession(item.session.id)
  }
  ElMessage.success('对话已彻底删除')
}

const scrollToBottom = async () => {
  // 等待 Vue 完成消息 DOM 更新后再读取 scrollHeight。
  await nextTick()
  if (!messagesRef.value) return
  messagesRef.value.scrollTop = messagesRef.value.scrollHeight
}

const updateActiveMessageFromScroll = () => {
  if (!messagesRef.value) return

  // 只查询当前渲染窗口中的用户消息。
  // querySelectorAll 返回 NodeList，Array.from 转成数组后才能方便使用 findLast。
  const rows = Array.from(messagesRef.value.querySelectorAll<HTMLElement>('[data-message-role="user"]'))
  if (!rows.length) {
    activeMessageId.value = ''
    return
  }

  // 使用视口上方约 42% 的位置作为“当前问题”，比贴顶切换更稳定。
  const marker = messagesRef.value.getBoundingClientRect().top + messagesRef.value.clientHeight * 0.42
  const current = rows.findLast((row) => row.getBoundingClientRect().top <= marker) ?? rows[0]
  activeMessageId.value = current?.dataset.messageId ?? ''
}

const jumpToMessage = async (messageId: string) => {
  // 搜索结果可能位于隐藏分支或尚未渲染的旧消息中，定位前要先把它变为可见。
  revealMessageBranch(messageId)
  const messageIndex = visibleMessages.value.findIndex((message) => message.id === messageId)
  if (messageIndex >= 0) {
    // slice 从尾部计算窗口，因此需要换算目标到数组尾部的距离。
    messageRenderLimit.value = Math.max(
      messageRenderLimit.value,
      visibleMessages.value.length - messageIndex,
    )
  }
  await nextTick()
  // CSS.escape 防止 id 中的特殊字符破坏属性选择器。
  const row = messagesRef.value?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`)
  if (!row) return

  row.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // 高亮只用于跳转反馈，定时结束后不会写入会话。
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
  // Markdown 内容由 v-html 注入，复制按钮和缺失引用都通过事件委托处理。
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
  // 助手消息排除思考过程和“最终回答”标记，供复制、搜索和导出复用。
  if (message.role === 'assistant') return getAnswerContent(message)

  return message.content
}

// ===== Export, favorites and search adapters =====
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
  // 复制的是用户看到的最终正文，而不是原始协议文本。
  const content = getMessagePlainText(message).trim()
  if (!content) return

  await navigator.clipboard.writeText(content)
  ElMessage.success('已复制消息')
}

const isToolButtonPressed = (tool: string) => {
  // 该兜底用于多个输入器短暂共存时读取实际按钮状态。
  if (typeof document === 'undefined') return false

  return Boolean(document.querySelector(`.composer-tools button[data-tool="${tool}"][aria-pressed="true"]`))
}

const getSendOptions = (): AppSendOptions => ({
  // 用对象字面量统一生成一次发送所需的所有配置，避免普通会话和项目会话读取到不同设置。
  // DOM 检查兼容多个输入器实例，最终仍与响应式设置取并集。
  agentMode: isAgentMode.value || isToolButtonPressed('agent-mode'),
  deepThinking: isDeepThinking.value || isToolButtonPressed('deep-thinking'),
  maxTokens: modelSettings.value.maxTokens || undefined,
  // 自定义指令和显式记忆只在请求时拼接，不写入可见消息历史。
  systemPrompt: [
    '你是 AI Chat，一个简洁、可靠的中文 AI 助手。回答要自然、清楚，优先解决用户当前问题。',
    customInstructions.value ? `用户自定义指令：\n${customInstructions.value}` : '',
    memories.value.length
      ? `用户明确保存的记忆：\n${memories.value.map((item) => `- ${item.content}`).join('\n')}`
      : '',
  // filter(Boolean) 去掉空字符串，再用空行拼成最终系统提示词。
  ].filter(Boolean).join('\n\n'),
  temperature: modelSettings.value.temperature,
  webSearch: isWebSearch.value || isToolButtonPressed('web-search'),
})

const openContextClearDialog = () => {
  // 生成期间禁止改变上下文边界，避免正在进行的请求与 UI 状态不一致。
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

  // 只记录上下文截断时间，不删除页面中的历史消息。
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
  // 提前保存目标状态，仅用于生成正确的操作反馈文案。
  const willPin = !session.pinned
  chatStore.toggleSessionPinned(session.id)
  openActionMenu.value = ''
  ElMessage.success(willPin ? '已置顶' : '已取消置顶')
}

const toggleProjectSessionPinned = (session: ChatSession) => {
  // 项目会话不经过 Store，需在这里直接修改并保存应用快照。
  const willPin = !session.pinned
  session.pinned = willPin
  openActionMenu.value = ''
  persistAppState()
  ElMessage.success(willPin ? '已置顶' : '已取消置顶')
}

const startEditingMessage = (message: ChatMessage) => {
  // 只允许编辑用户问题；提交后创建分支而不是原地篡改历史。
  if (isResponding.value || message.role !== 'user') return

  editingMessageId.value = message.id
  editingDraft.value = message.content
}

const cancelEditingMessage = () => {
  editingMessageId.value = ''
  editingDraft.value = ''
}

const hasPreviousUserMessage = (message: ChatMessage) => {
  // 第一条欢迎类助手消息没有可用于重新生成的用户问题。
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
  // 重试从目标问题开始重新生成，因此删除它之后的旧回答和后续对话。
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
  // 分支会话使用新 id，来源数组也复制，避免两个会话共享可变引用。
  id: createId(),
  role: message.role,
  content: message.content,
  error: message.error,
  reasoningContent: message.reasoningContent,
  reasoningEndedAt: message.reasoningEndedAt,
  reasoningStartedAt: message.reasoningStartedAt,
  // sources 是对象数组，需要连数组元素也复制；只写 [...message.sources] 仍会共享 source 对象。
  sources: message.sources?.map((source) => ({ ...source })),
  truncated: message.truncated,
  createdAt: message.createdAt,
})

const createBranchedSession = async (sourceMessage: ChatMessage, content: string) => {
  const parentSession = activeSession.value
  if (!parentSession || isResponding.value) return

  const sourceIndex = visibleMessages.value.findIndex((message) => message.id === sourceMessage.id)
  if (sourceIndex < 0) return

  // “在新聊天中编辑”会复制分叉点之前的可见上下文，原会话保持不变。
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

  // 从回答分支时把当前回答也复制过去，新聊天从下一轮继续。
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
  // 编辑器先退出，再切换到新分支会话，避免旧页面保留编辑状态。
  const content = editingDraft.value.trim()
  if (!content) return

  cancelEditingMessage()
  await createBranchedSession(message, content)
}

const regenerateAssistantMessage = async (message: ChatMessage) => {
  // 重新生成从该回答之前最近的用户问题重新提交。
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

const continueAssistantMessage = async (message: ChatMessage) => {
  const session = activeSession.value
  if (!session || isResponding.value || message.role !== 'assistant' || !message.truncated) return

  const messageIndex = session.messages.findIndex((item) => item.id === message.id)
  if (messageIndex < 0) return

  const originalContent = message.content.trimEnd()
  // 续写提示只进入请求上下文，不保存为用户可见消息。
  const continuationPrompt: ChatMessage = {
    id: createId(),
    role: 'user',
    content: '请直接从上一条回答中断的位置继续，不要重复已经回答的内容，也不要添加“继续”等说明。',
    createdAt: Date.now(),
  }
  const contextMessages = [...session.messages.slice(0, messageIndex + 1), continuationPrompt]
  const sendOptions = getSendOptions()
  let nextContent = originalContent
  let responseError = ''
  let responseTruncated = false
  let hasReceivedToken = false

  message.error = undefined
  message.truncated = undefined
  const controller = new AbortController()
  continuationAbortController = controller

  if (isProjectMode.value) {
    // 续写复用原消息 id，流式 UI 会在原回答末尾继续更新。
    isProjectResponding.value = true
    projectStreamingMessageId.value = message.id
    projectStreamingMessageContent.value = originalContent
  } else {
    chatStore.isResponding = true
    chatStore.streamingMessageId = message.id
    chatStore.streamingMessageContent = originalContent
  }

  const appendToken = (token: string) => {
    if (!hasReceivedToken) {
      // 首个续写 token 前补段落分隔，避免与原回答最后一句粘连。
      hasReceivedToken = true
      nextContent += nextContent && !/\s$/.test(nextContent) ? '\n\n' : ''
    }
    nextContent += token
    message.content = nextContent
    if (isProjectMode.value) projectStreamingMessageContent.value = nextContent
    else chatStore.streamingMessageContent = nextContent
  }

  await chatStore.requestAssistantReply(contextMessages, {
    agentMode: sendOptions.agentMode,
    contextClearedAt: session.contextClearedAt,
    deepThinking: false,
    maxTokens: sendOptions.maxTokens,
    temperature: sendOptions.temperature,
    webSearch: sendOptions.webSearch,
    onError: (error) => {
      responseError = error
    },
    onFinish: (truncated) => {
      responseTruncated = truncated
    },
    onSources: (sources) => {
      // 续写可能带来新来源，按 URL 合并而不覆盖原来源列表。
      const existingSources = message.sources ?? []
      message.sources = [...existingSources]
      sources.forEach((source) => {
        if (!message.sources?.some((item) => item.url === source.url)) message.sources?.push(source)
      })
    },
    onToken: appendToken,
    signal: controller.signal,
    systemPrompt: isProjectMode.value
      ? [
          sendOptions.systemPrompt,
          `当前项目：${activeProject.value}`,
          projectDescriptions.value[activeProject.value]
            ? `项目说明：${projectDescriptions.value[activeProject.value]}`
            : '',
        ].filter(Boolean).join('\n\n')
      : sendOptions.systemPrompt,
  })

  if (controller.signal.aborted) return
  // 正常完成后才写回错误、截断和更新时间；中止由 stopResponding 负责。
  continuationAbortController = null
  message.error = responseError || undefined
  message.truncated = responseTruncated || undefined
  session.updatedAt = Date.now()

  if (isProjectMode.value) {
    isProjectResponding.value = false
    projectStreamingMessageId.value = ''
    projectStreamingMessageContent.value = ''
    persistAppState()
  } else {
    chatStore.isResponding = false
    chatStore.streamingMessageId = ''
    chatStore.streamingMessageContent = ''
    persistChatSessions()
  }
}

const showNavigatorTooltip = (
  item: { fullLabel: string },
  event: Event,
) => {
  // tooltip 使用 fixed 定位，right 值从触发元素左边缘反算。
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
  // 桌面端调用该函数不改变侧栏状态。
  if (isMobileViewport.value) isSidebarCollapsed.value = true
}

// ===== Reactive synchronization =====
watch(
  () => activeSession.value?.messages.length,
  () => {
    // 新消息或删除消息后滚到底部，并同步右侧导航当前项。
    void scrollToBottom().then(updateActiveMessageFromScroll)
  },
)

// watch 的第一个参数是“要监听什么”，第二个参数是变化后的处理函数。
// 这里使用 getter，只监听当前会话消息数量，而不是深度监听整个会话对象。
watch(
  () => activeSession.value?.id,
  () => {
    // 切换会话后恢复默认渲染窗口，避免沿用上一条长会话的展开数量。
    messageRenderLimit.value = 80
    void nextTick(updateActiveMessageFromScroll)
  },
)

watch(
  [
    projects,
    projectSessions,
    projectDescriptions,
    promptTemplates,
    modelSettings,
    customInstructions,
    memories,
    activeProject,
    activeProjectSessionId,
    currentMode,
    isProjectHome,
    profileName,
    avatarImage,
    themeMode,
  ],
  () => {
    // 这些值都可能在子 composable 中被原地修改，因此使用深度监听统一持久化。
    persistAppState()
  },
  { deep: true },
)
// deep: true 会继续追踪数组元素和对象内部字段。
// 例如直接执行 session.title = '新标题' 时，外层 projectSessions Ref 没有被替换，
// 但深度监听仍能发现内部字段变化并保存 localStorage。

watch(
  isResponding,
  (responding) => {
    // 思考用时需要每秒刷新，但只在生成期间保留计时器。
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
  // immediate 让回调在注册时先执行一次，用当前状态完成计时器初始化。
  { immediate: true },
)

const sendProjectContent = async (content: string, sendOptions: AppSendOptions = getSendOptions()) => {
  // 项目会话没有放进全局 Pinia store，因此保留一套与普通会话对称的发送流程。
  const session = activeProjectSession.value
  const trimmedContent = content.trim()
  if (!session || !trimmedContent || isProjectResponding.value) return

  const now = Date.now()
  const branchSourceIndex = sendOptions.branchOf
    ? session.messages.findIndex((message) => message.id === sendOptions.branchOf)
    : -1
  const userMessage: ChatMessage = {
    // branchOf 只在同一会话内重新生成/编辑形成的版本中存在。
    branchLabel: sendOptions.branchLabel,
    branchOf: sendOptions.branchOf,
    id: createId(),
    role: 'user',
    content: trimmedContent,
    createdAt: now,
  }
  session.messages.push(userMessage)
  if (sendOptions.branchOf) {
    // 新分支立即设为当前可见版本。
    session.activeBranchIds = {
      ...(session.activeBranchIds ?? {}),
      [sendOptions.branchOf]: userMessage.id,
    }
  }

  if (session.messages.length === 1) {
    // 项目会话标题同样由首条问题自动生成。
    session.title = summarizeTitle(trimmedContent)
  }

  session.updatedAt = now
  isProjectResponding.value = true
  projectAbortController = new AbortController()

  persistAppState()

  let assistantMessage: ChatMessage | null = null
  // 部分兼容接口不提供 reasoning_content，而是把思考和答案混在 content 中。
  let contentFallbackBuffer = ''
  let hasProviderReasoning = false
  let responseError = ''
  let responseSources: WebSearchSource[] = []
  let responseTruncated = false
  const ensureProjectAssistantMessage = () => {
    // 延迟创建助手消息，首个事件到来前由单独的等待状态占位。
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
    // 分支重试只提交分叉点之前的上下文，避免旧版本回答影响新版本。
    branchSourceIndex >= 0 ? [...session.messages.slice(0, branchSourceIndex), userMessage] : session.messages

  // 项目会话复用 Store 的底层请求方法，但通过回调把 token 写入项目自己的状态。
  // 所以 requestAssistantReply 只负责网络协议，不关心数据最终属于哪一种会话。
  const reply = await chatStore.requestAssistantReply(contextMessages, {
    agentMode: sendOptions.agentMode,
    contextClearedAt: session.contextClearedAt,
    deepThinking: sendOptions.deepThinking,
    maxTokens: sendOptions.maxTokens,
    temperature: sendOptions.temperature,
    webSearch: sendOptions.webSearch,
    onError: (message) => {
      // 错误也会触发助手消息创建，使重试入口能够持久化展示。
      responseError = message
      ensureProjectAssistantMessage().error = message
    },
    onFinish: (truncated) => {
      // finish_reason=length/max_tokens 时由消息展示“继续生成”。
      responseTruncated = truncated
    },
    onSources: (sources) => {
      // 来源可能在正文结束前或结束后到达，先缓存并尽早更新已创建消息。
      responseSources = sources
      const message = assistantMessage as ChatMessage | null
      if (message) message.sources = sources
    },
    onReasoning: (token) => {
      // 收到专用 reasoning 字段后停止使用 content 拆分兜底。
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
      // 正文 token 同时更新流式展示缓存和最终消息对象。
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
          // 响应直接以“最终回答”开头，说明不存在可展示的前置思考。
          projectStreamingReasoningContent.value = ''
          projectStreamingReasoningEndedAt.value = 0
          projectStreamingReasoningStartedAt.value = 0
          projectStreamingMessageContent.value = directAnswer
          message.reasoningContent = undefined
          message.reasoningEndedAt = undefined
          message.reasoningStartedAt = undefined
          message.content = directAnswer
        } else if (fallbackSplit) {
          // 已检测到分隔标记，分别更新思考区和正文区。
          if (!projectStreamingReasoningEndedAt.value) {
            projectStreamingReasoningEndedAt.value = now
            message.reasoningEndedAt = now
          }
          projectStreamingReasoningContent.value = fallbackSplit.reasoning
          projectStreamingMessageContent.value = fallbackSplit.answer
          message.reasoningContent = fallbackSplit.reasoning
          message.content = fallbackSplit.answer
        } else {
          // 尚未出现答案分隔时先把累计内容放在思考区域。
          projectStreamingReasoningContent.value = contentFallbackBuffer
          projectStreamingMessageContent.value = ''
          message.reasoningContent = contentFallbackBuffer
          message.content = ''
        }

        session.updatedAt = now
        return
      }

      if (projectStreamingReasoningContent.value && !projectStreamingReasoningEndedAt.value) {
        // 首个正式正文 token 到来即视为思考结束。
        projectStreamingReasoningEndedAt.value = Date.now()
        message.reasoningEndedAt = projectStreamingReasoningEndedAt.value
      }
      // 流式缓存用于当前动画展示；请求完成后还会把最终结果固定到 message.content。
      projectStreamingMessageContent.value += token
      session.updatedAt = Date.now()
    },
    signal: projectAbortController.signal,
    systemPrompt: [
      // 项目名和项目说明只影响项目内请求。
      sendOptions.systemPrompt,
      `当前项目：${activeProject.value}`,
      projectDescriptions.value[activeProject.value] ? `项目说明：${projectDescriptions.value[activeProject.value]}` : '',
    ].filter(Boolean).join('\n\n'),
  })
  projectAbortController = null
  if (!isProjectResponding.value) return

  const completedAssistantMessage = assistantMessage as ChatMessage | null
  if (completedAssistantMessage) {
    // 流结束后统一校正正文、思考时间、来源和截断状态，再进行持久化。
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
      // 没有可靠分隔标记时宁可全部作为正文，避免回答永久藏在思考区。
      finalContent = contentFallbackBuffer
      finalReasoning = ''
      reasoningStartedAt = 0
      reasoningEndedAt = 0
    }

    const reasoningAnswerSplit = finalReasoning.trim() && !finalContent.trim()
      ? splitReasoningFromAnswer(finalReasoning)
      : null

    if (reasoningAnswerSplit) {
      // 某些响应把最终答案错误地继续写进 reasoning 字段，再做一次收尾拆分。
      finalContent = reasoningAnswerSplit.answer
      finalReasoning = reasoningAnswerSplit.reasoning
      reasoningStartedAt = reasoningStartedAt || completedAssistantMessage.createdAt
      reasoningEndedAt = reasoningEndedAt || Date.now()
    } else if (finalReasoning.trim() && !finalContent.trim()) {
      finalContent = MISSING_FINAL_ANSWER
    }

    completedAssistantMessage.content = finalContent
    completedAssistantMessage.error = responseError || undefined
    completedAssistantMessage.reasoningContent = finalReasoning || undefined
    completedAssistantMessage.reasoningStartedAt = reasoningStartedAt || undefined
    completedAssistantMessage.reasoningEndedAt = reasoningEndedAt || undefined
    completedAssistantMessage.sources = responseSources.length ? responseSources : undefined
    completedAssistantMessage.truncated = responseTruncated || undefined
  } else if (reply) {
    // 非流式兼容响应没有触发回调时，根据最终 reply 补建助手消息。
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
      truncated: responseTruncated || undefined,
      createdAt,
    }
    session.messages.push(assistantMessage)
  }
  session.updatedAt = Date.now()
  // 清空临时流式状态，历史展示从消息对象读取最终内容。
  isProjectResponding.value = false
  projectStreamingMessageContent.value = ''
  projectStreamingMessageId.value = ''
  projectStreamingReasoningContent.value = ''
  projectStreamingReasoningEndedAt.value = 0
  projectStreamingReasoningStartedAt.value = 0
  persistAppState()
}

// ===== Project/session navigation commands =====
const {
  actionDialog,
  actionMenuStyle,
  archiveSession,
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
  archiveChatSession: (sessionId) => chatStore.archiveSession(sessionId),
  chatSessions: chatStore.sessions,
  closeMobileSidebar: () => closeMobileSidebar(),
  createId,
  currentMode,
  deleteChatSession: (sessionId) => chatStore.trashSession(sessionId),
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
    // 切换到新上下文时恢复用户设置的默认工具状态。
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
  // 普通输入器统一入口，根据当前导航状态选择具体发送路径。
  if (!hasDraft.value) return

  // 先保存字符串再清空输入框，否则后续异步代码读取 draft 时已经拿不到原内容。
  const content = draft.value
  const sendOptions = getSendOptions()
  draft.value = ''

  // “新建对话”先展示空页面，真正发送时才创建持久化会话。
  if (isPendingNewSession.value) {
    chatStore.createSession()
    isPendingNewSession.value = false
  }

  if (isPendingProjectSession.value && activeProject.value) {
    // 预留的项目新会话同样延迟到首次发送才创建。
    createProjectSession(activeProject.value)
    isPendingProjectSession.value = false
    await sendProjectContent(content, sendOptions)
    return
  }

  if (activeProjectSession.value) {
    // 已打开项目会话时直接走项目本地发送流程。
    await sendProjectContent(content, sendOptions)
    return
  }

  await chatStore.sendMessage(content, sendOptions)
}

const removeInterruptedAssistant = (session: ChatSession | undefined, streamingMessageId: string) => {
  // 停止请求后区分“尚未产生内容”和“已有部分内容”。
  if (!session) return

  const lastMessage = session.messages.at(-1)
  const shouldRemoveAssistant = lastMessage?.role === 'assistant' && !lastMessage.content.trim() && !lastMessage.error

  if (shouldRemoveAssistant) {
    // 空白占位没有保留价值，直接从历史移除。
    session.messages.splice(-1, 1)
    session.updatedAt = Date.now()
  } else if (lastMessage?.role === 'assistant' && streamingMessageId && lastMessage.id === streamingMessageId) {
    // 已生成的内容保留下来，并标记为可继续生成，而不是终止时整条删除。
    lastMessage.truncated = true
    session.updatedAt = Date.now()
  }
}

const stopResponding = () => {
  // 三种可能的请求共享同一个停止入口：普通会话、项目会话和续写。
  const session = activeSession.value
  const chatStreamingMessageId = chatStore.streamingMessageId
  const projectStreamingId = projectStreamingMessageId.value

  chatStore.stopResponding()
  // AbortController 负责真正终止 fetch，状态重置本身不能停止网络读取。
  // 可选链 ?. 表示控制器存在才调用 abort，不存在时什么也不做。
  projectAbortController?.abort()
  projectAbortController = null
  continuationAbortController?.abort()
  continuationAbortController = null

  if (isProjectMode.value) {
    // 停止项目请求后仍留在当前项目会话，而不是返回项目首页。
    removeInterruptedAssistant(session, projectStreamingId)
    isPendingProjectSession.value = false
    isProjectHome.value = false
    persistAppState()
  } else {
    // 普通会话停止后清理可能残留的项目导航字段。
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

// ===== Global keyboard, pointer and viewport interactions =====
const { focusDraftInput } = useGlobalInteractions({
  actionDialog,
  closeActionDialog,
  closeContextClearDialog,
  closeConversationManager,
  closeExportDialog,
  closeFavoritesManager,
  closeSearch,
  closeSessionSearch,
  closeSettings,
  closeTemplateManager,
  hasDraft,
  isContextClearOpen,
  isConversationManagerOpen,
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
  // 对应 Vue 2 的 beforeDestroy，用于清理组件创建的计时器和副作用。
  // 请求由各自 AbortController 管理，这里只清理页面级计时器。
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

  // App.vue 只消费这个公开接口，内部辅助状态不向模板泄漏。
  // composable 没有固定返回格式；这里只返回 App.vue 真正需要的公开状态和方法。
  // 没有返回的局部函数仍被闭包保留，但模板和其他模块无法直接访问。
  return {
    // 设置和输入草稿
    addDraftMemory,
    chatStore,
    draft,
    draftCustomInstructions,
    draftMemories,
    draftMemory,
    // 消息容器与编辑状态
    messagesRef,
    editingMessageId,
    editingDraft,
    // 页面、弹窗和导航状态
    isMobileViewport,
    isSidebarCollapsed,
    isSearchOpen,
    isSessionSearchOpen,
    isExportOpen,
    isFavoritesOpen,
    isTemplateManagerOpen,
    isContextClearOpen,
    isConversationManagerOpen,
    conversationManagerMode,
    // 搜索与收藏筛选条件
    searchText,
    sessionSearchText,
    favoriteSearchText,
    favoriteScope,
    // 侧边栏和项目状态
    isProjectsOpen,
    isRecentOpen,
    isSettingsOpen,
    activeProject,
    isProjectHome,
    isPendingNewSession,
    isPendingProjectSession,
    // 设置弹窗草稿和当前工具状态
    draftModelSettings,
    isDeepThinking,
    isAgentMode,
    isWebSearch,
    // 导出与模板编辑状态
    exportMode,
    selectedExportMessageIds,
    editingTemplateId,
    draftTemplateLabel,
    draftTemplatePrompt,
    // 消息导航与菜单状态
    activeMessageId,
    highlightedMessageId,
    hoveredNavigatorItem,
    openActionMenu,
    actionMenuStyle,
    actionDialog,
    projectDescriptions,
    // 用户资料和外观
    profileName,
    draftProfileName,
    avatarImage,
    themeMode,
    draftThemeMode,
    promptTemplates,
    // 当前页面的核心派生状态
    activeSession,
    isFreshSession,
    isProjectMode,
    isResponding,
    isWaitingForFirstToken,
    streamingAssistantMessageId,
    streamingAssistantMessageContent,
    headerSessionTitle,
    // 列表和搜索结果
    projects,
    searchResults,
    sessionSearchResults,
    sidebarSessions,
    activeProjectSessions,
    archivedConversations,
    favoriteResults,
    // 消息分支、窗口化和导航数据
    visibleMessages,
    favoriteScopeOptions,
    filteredFavoriteResults,
    messageNavigatorItems,
    managedConversationItems,
    renderedMessages,
    hiddenMessageCount,
    exportableMessages,
    selectedExportMessages,
    // 纯展示辅助值
    savedAvatarDisplay,
    // 消息滚动、定位和渲染交互
    updateActiveMessageFromScroll,
    jumpToMessage,
    loadEarlierMessages,
    copyRenderedCode,
    getReasoningContent,
    getAnswerContent,
    getBranchSwitcher,
    selectBranch,
    // 消息操作和收藏
    copyMessage,
    toggleMessageFavorite,
    switchFromFavorite,
    openFavoritesManager,
    openConversationManager,
    closeFavoritesManager,
    closeConversationManager,
    removeFavorite,
    removeDraftMemory,
    removeManagedConversation,
    // 导入导出
    openExportDialog,
    closeExportDialog,
    toggleExportMessage,
    getExportMessagePreview,
    exportCurrentSession,
    importMarkdownSession,
    // 思考展示和工具开关
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
    // 上下文和会话消息操作
    restoreManagedConversation,
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
    continueAssistantMessage,
    showNavigatorTooltip,
    hideNavigatorTooltip,
    // 发送、停止和搜索导航
    send,
    stopResponding,
    openSearch,
    closeSearch,
    openSessionSearch,
    closeSessionSearch,
    switchFromSearch,
    switchFromSessionSearch,
    getResultPreview,
    // 项目与会话管理
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
    archiveSession,
    trashManagedConversation,
    trashedConversations,
    closeActionDialog,
    confirmActionDialog,
    // 设置和通用格式化
    handleAvatarUpload,
    openSettings,
    saveSettings,
    closeSettings,
    formatTime,
  }
}
