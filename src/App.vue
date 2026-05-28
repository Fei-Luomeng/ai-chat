<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowRight,
  ChatDotRound,
  CircleCloseFilled,
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

import { useChatStore, type ChatMessage, type ChatSession } from '@/stores/chat'

const chatStore = useChatStore()
const draft = ref('')
const messagesRef = ref<HTMLElement | null>(null)
const isSidebarCollapsed = ref(false)
const isSearchOpen = ref(false)
const searchText = ref('')
const isProjectsOpen = ref(true)
const isRecentOpen = ref(true)
const isSettingsOpen = ref(false)
const activeProject = ref('')
const currentMode = ref<'chat' | 'project'>('chat')
const isProjectHome = ref(false)
const isPendingNewSession = ref(false)
const isPendingProjectSession = ref(false)
const activeProjectSessionId = ref('')
const isProjectResponding = ref(false)
const openActionMenu = ref('')
const actionMenuStyle = ref<Record<string, string>>({})
const actionDialog = ref<
  | { type: 'rename-project'; projectName: string; value: string }
  | { type: 'delete-project'; projectName: string; value: string }
  | { type: 'rename-session'; sessionId: string; value: string }
  | { type: 'delete-session'; sessionId: string; value: string }
  | null
>(null)
const projectSessions = ref<Record<string, ChatSession[]>>({
  'AI Chat 工作台': [
    {
      id: 'project-ai-plan',
      title: '项目接口设计',
      messages: [
        {
          id: 'project-ai-welcome',
          role: 'assistant',
          content: '你好，我是你的 AI 助手。可以帮你整理想法、写代码、润色文案，或者陪你拆解一个复杂问题。',
          createdAt: Date.now() - 1000 * 60 * 120,
        },
        {
          id: 'project-ai-user',
          role: 'user',
          content: '帮我规划一下这个 AI Chat 项目的接口和状态结构。',
          createdAt: Date.now() - 1000 * 60 * 118,
        },
      ],
      updatedAt: Date.now() - 1000 * 60 * 110,
    },
  ],
  面试题整理: [
    {
      id: 'project-interview-plan',
      title: '项目内复习安排',
      messages: [
        {
          id: 'project-interview-welcome',
          role: 'assistant',
          content: '你好，我是你的 AI 助手。可以帮你整理想法、写代码、润色文案，或者陪你拆解一个复杂问题。',
          createdAt: Date.now() - 1000 * 60 * 90,
        },
        {
          id: 'project-interview-user',
          role: 'user',
          content: '这个项目里单独整理一份面试题复习顺序。',
          createdAt: Date.now() - 1000 * 60 * 88,
        },
      ],
      updatedAt: Date.now() - 1000 * 60 * 80,
    },
  ],
  简历优化: [],
})
const profileName = ref('Feather Mask')
const profileAvatar = ref('FM')
const draftProfileName = ref(profileName.value)
const avatarImage = ref('')
const themeMode = ref<'light' | 'dark'>('light')
const draftThemeMode = ref<'light' | 'dark'>(themeMode.value)
let projectResponseTimer: ReturnType<typeof window.setTimeout> | null = null

const createId = () => crypto.randomUUID()
const welcomeContent = '你好，我是你的 AI 助手。可以帮你整理想法、写代码、润色文案，或者陪你拆解一个复杂问题。'

const createWelcomeMessage = (): ChatMessage => ({
  id: createId(),
  role: 'assistant',
  content: welcomeContent,
  createdAt: Date.now(),
})

const summarizeTitle = (content: string) => {
  const normalized = content.trim().replace(/\s+/g, ' ')
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || '新的对话'
}

const activeProjectSession = computed(() => {
  if (!activeProject.value || !activeProjectSessionId.value) return undefined
  return projectSessions.value[activeProject.value]?.find((session) => session.id === activeProjectSessionId.value)
})

const activeSession = computed(() => activeProjectSession.value ?? chatStore.activeSession)
const hasDraft = computed(() => draft.value.trim().length > 0)
const isFreshSession = computed(
  () => isPendingNewSession.value || isPendingProjectSession.value || (activeSession.value?.messages.length ?? 0) <= 1,
)
const isProjectMode = computed(() => currentMode.value === 'project' && Boolean(activeProject.value))
const isResponding = computed(() => chatStore.isResponding || isProjectResponding.value)
const headerSessionTitle = computed(() => {
  if (isPendingNewSession.value || isPendingProjectSession.value) return '新的对话'
  return activeSession.value?.title
})

const projects = ref(['AI Chat 工作台', '面试题整理', '简历优化'])

const promptExamples = [
  '帮我把这个项目接入 OpenAI API',
  '写一个产品需求文档的大纲',
  '整理一份前端面试复习计划',
]

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

const savedAvatarDisplay = computed(() => profileAvatar.value.trim().slice(0, 2).toUpperCase() || 'U')

const scrollToBottom = async () => {
  await nextTick()
  if (!messagesRef.value) return
  messagesRef.value.scrollTop = messagesRef.value.scrollHeight
}

watch(
  () => activeSession.value?.messages.length,
  () => {
    void scrollToBottom()
  },
)

const createProjectSession = (projectName: string) => {
  const now = Date.now()
  const session: ChatSession = {
    id: `project-${createId()}`,
    title: '新的对话',
    messages: [
      {
        ...createWelcomeMessage(),
        createdAt: now,
      },
    ],
    updatedAt: now,
  }

  projectSessions.value = {
    ...projectSessions.value,
    [projectName]: [session, ...(projectSessions.value[projectName] ?? [])],
  }
  activeProjectSessionId.value = session.id
  return session
}

const sendProjectContent = async (content: string) => {
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

  if (session.messages.length === 2) {
    session.title = summarizeTitle(trimmedContent)
  }

  session.updatedAt = now
  isProjectResponding.value = true

  await new Promise<void>((resolve) => {
    projectResponseTimer = window.setTimeout(() => {
      projectResponseTimer = null
      resolve()
    }, 900)
  })

  if (!isProjectResponding.value) return

  session.messages.push({
    id: createId(),
    role: 'assistant',
    content: chatStore.composeAssistantReply(trimmedContent),
    createdAt: Date.now(),
  })
  session.updatedAt = Date.now()
  isProjectResponding.value = false
}

const send = async () => {
  if (!hasDraft.value) return

  const content = draft.value
  draft.value = ''

  if (isPendingNewSession.value) {
    chatStore.createSession()
    isPendingNewSession.value = false
  }

  if (isPendingProjectSession.value && activeProject.value) {
    createProjectSession(activeProject.value)
    isPendingProjectSession.value = false
    await sendProjectContent(content)
    return
  }

  if (activeProjectSession.value) {
    await sendProjectContent(content)
    return
  }

  await chatStore.sendMessage(content)
}

const usePrompt = (prompt: string) => {
  draft.value = prompt
}

const clearChat = () => {
  if (activeProjectSession.value) {
    const now = Date.now()
    activeProjectSession.value.title = '新的对话'
    activeProjectSession.value.messages = [
      {
        ...createWelcomeMessage(),
        createdAt: now,
      },
    ]
    activeProjectSession.value.updatedAt = now
  } else {
    chatStore.clearActiveSession()
  }
  ElMessage.success('已清空当前会话')
}

const stopResponding = () => {
  chatStore.stopResponding()
  if (projectResponseTimer) {
    window.clearTimeout(projectResponseTimer)
    projectResponseTimer = null
  }
  isProjectResponding.value = false
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

  createProjectSession(activeProject.value)
  currentMode.value = 'project'
  isProjectHome.value = false
  isPendingNewSession.value = false
  isPendingProjectSession.value = false

  draft.value = ''
  await sendProjectContent(content)
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
  delete projectSessions.value[projectName]

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
        <div class="header-actions">
          <el-tooltip v-if="isResponding" content="终止生成" placement="bottom">
            <el-button class="stop-button" :icon="CircleCloseFilled" circle @click="stopResponding" />
          </el-tooltip>
          <el-tooltip content="清空当前会话" placement="bottom">
            <el-button :icon="Delete" circle @click="clearChat" />
          </el-tooltip>
        </div>
      </header>

      <template v-if="isProjectMode && isProjectHome">
        <div class="project-home">
          <div class="project-home-inner">
            <div class="project-title-row">
              <FolderOpened :size="34" />
              <h1>{{ activeProject }}</h1>
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
              <button type="button" class="project-send" :disabled="!hasDraft" @click="sendProjectMessage">
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
                <button type="button" aria-label="对话操作" @click.stop="toggleActionMenu(`home-session-${session.id}`, $event)">
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
              <p v-if="activeProjectSessions.length === 0" class="project-empty">这个项目还没有对话</p>
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
              <el-button
                v-if="isResponding"
                class="composer-stop"
                :icon="CircleCloseFilled"
                circle
                @click="stopResponding"
              />
              <el-button
                v-else
                type="primary"
                :icon="Promotion"
                :disabled="!hasDraft"
                circle
                @click="send"
              />
            </div>
            <div class="prompt-row center-prompts">
              <button v-for="prompt in promptExamples" :key="prompt" type="button" @click="usePrompt(prompt)">
                {{ prompt }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div ref="messagesRef" class="messages">
          <article
            v-for="message in activeSession?.messages"
            :key="message.id"
            class="message-row"
            :class="message.role"
          >
            <div class="avatar">{{ message.role === 'assistant' ? 'AI' : '你' }}</div>
            <div class="message-content">
              <div class="message-meta">
                <strong>{{ message.role === 'assistant' ? 'AI Chat' : '你' }}</strong>
                <span>{{ formatTime(message.createdAt) }}</span>
              </div>
              <p>{{ message.content }}</p>
            </div>
          </article>

          <article v-if="isResponding" class="message-row assistant">
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

        <div class="composer-panel">
          <div class="prompt-row">
            <button v-for="prompt in promptExamples" :key="prompt" type="button" @click="usePrompt(prompt)">
              {{ prompt }}
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
            <el-button
              v-if="isResponding"
              class="composer-stop"
              :icon="CircleCloseFilled"
              circle
              @click="stopResponding"
            />
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
          <h2>{{ actionDialog.type.startsWith('rename') ? '重命名' : '确认删除' }}</h2>
          <button type="button" aria-label="关闭弹窗" @click="closeActionDialog">
            <Close :size="18" />
          </button>
        </header>
        <div class="confirm-body">
          <template v-if="actionDialog.type.startsWith('rename')">
            <label>
              <span>名称</span>
              <input v-model="actionDialog.value" />
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
            {{ actionDialog.type.startsWith('rename') ? '保存' : '删除' }}
          </button>
        </footer>
      </section>
    </div>
  </main>
</template>
