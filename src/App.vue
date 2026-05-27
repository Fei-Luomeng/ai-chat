<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
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

import { useChatStore, type ChatSession } from '@/stores/chat'

const chatStore = useChatStore()
const draft = ref('')
const messagesRef = ref<HTMLElement | null>(null)
const isSidebarCollapsed = ref(false)
const isSearchOpen = ref(false)
const searchText = ref('')
const isProjectsOpen = ref(true)
const isSettingsOpen = ref(false)
const activeProject = ref('')
const currentMode = ref<'chat' | 'project'>('chat')
const isProjectHome = ref(false)
const openActionMenu = ref('')
const projectSessionIds = ref<Record<string, string[]>>({
  'AI Chat 工作台': ['session-1', 'session-interview', 'session-resume'],
  面试题整理: ['session-interview'],
  简历优化: ['session-resume'],
})
const profileName = ref('Feather Mask')
const profileAvatar = ref('FM')
const draftProfileName = ref(profileName.value)
const profileBio = ref('前端学习中')
const profileEmail = ref('feather@example.com')
const avatarImage = ref('')
const themeMode = ref<'light' | 'dark'>('light')
const draftThemeMode = ref<'light' | 'dark'>(themeMode.value)

const activeSession = computed(() => chatStore.activeSession)
const hasDraft = computed(() => draft.value.trim().length > 0)
const isFreshSession = computed(() => (activeSession.value?.messages.length ?? 0) <= 1)
const isProjectMode = computed(() => currentMode.value === 'project' && Boolean(activeProject.value))

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

  const ids = projectSessionIds.value[activeProject.value] ?? []
  return chatStore.sessions.filter((session) => ids.includes(session.id))
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

const send = async () => {
  if (!hasDraft.value) return

  const content = draft.value
  draft.value = ''
  await chatStore.sendMessage(content)
}

const usePrompt = (prompt: string) => {
  draft.value = prompt
}

const clearChat = () => {
  chatStore.clearActiveSession()
  ElMessage.success('已清空当前会话')
}

const stopResponding = () => {
  chatStore.stopResponding()
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
  chatStore.createSession()
  draft.value = ''
  currentMode.value = 'chat'
  activeProject.value = ''
  isProjectHome.value = false
  openActionMenu.value = ''
}

const selectProject = (projectName: string) => {
  activeProject.value = projectName
  currentMode.value = 'project'
  isProjectHome.value = true
  isProjectsOpen.value = true
  openActionMenu.value = ''
}

const switchProjectSession = (sessionId: string) => {
  chatStore.switchSession(sessionId)
  currentMode.value = 'project'
  isProjectHome.value = false
  openActionMenu.value = ''
  void scrollToBottom()
}

const createProjectSession = () => {
  if (!activeProject.value) return

  const sessionId = chatStore.createSession()
  projectSessionIds.value = {
    ...projectSessionIds.value,
    [activeProject.value]: [sessionId, ...(projectSessionIds.value[activeProject.value] ?? [])],
  }
  currentMode.value = 'project'
  isProjectHome.value = false
  draft.value = ''
}

const sendProjectMessage = async () => {
  if (!activeProject.value) return

  const content = draft.value.trim()
  const sessionId = chatStore.createSession()
  projectSessionIds.value = {
    ...projectSessionIds.value,
    [activeProject.value]: [sessionId, ...(projectSessionIds.value[activeProject.value] ?? [])],
  }
  currentMode.value = 'project'
  isProjectHome.value = false

  if (content) {
    draft.value = ''
    await chatStore.sendMessage(content)
  }
}

const toggleActionMenu = (menuId: string) => {
  openActionMenu.value = openActionMenu.value === menuId ? '' : menuId
}

const renameProject = (projectName: string) => {
  const nextName = window.prompt('重命名项目', projectName)?.trim()
  if (!nextName || nextName === projectName) return

  projects.value = projects.value.map((item) => (item === projectName ? nextName : item))
  projectSessionIds.value = {
    ...projectSessionIds.value,
    [nextName]: projectSessionIds.value[projectName] ?? [],
  }
  delete projectSessionIds.value[projectName]

  if (activeProject.value === projectName) {
    activeProject.value = nextName
  }
  openActionMenu.value = ''
}

const deleteProject = (projectName: string) => {
  if (!window.confirm(`删除项目「${projectName}」？项目中的对话会回到最近对话。`)) return

  projects.value = projects.value.filter((item) => item !== projectName)
  delete projectSessionIds.value[projectName]
  if (activeProject.value === projectName) {
    activeProject.value = ''
    currentMode.value = 'chat'
    isProjectHome.value = false
  }
  openActionMenu.value = ''
}

const renameSession = (session: ChatSession) => {
  const nextTitle = window.prompt('重命名对话', session.title)?.trim()
  if (!nextTitle || nextTitle === session.title) return

  chatStore.renameSession(session.id, nextTitle)
  openActionMenu.value = ''
}

const deleteSession = (sessionId: string) => {
  if (!window.confirm('删除这个对话？')) return

  chatStore.deleteSession(sessionId)
  Object.keys(projectSessionIds.value).forEach((projectName) => {
    projectSessionIds.value[projectName] = projectSessionIds.value[projectName].filter((id) => id !== sessionId)
  })
  openActionMenu.value = ''
}

const moveSessionToProject = (sessionId: string, projectName: string) => {
  projectSessionIds.value = {
    ...projectSessionIds.value,
    [projectName]: Array.from(new Set([sessionId, ...(projectSessionIds.value[projectName] ?? [])])),
  }
  ElMessage.success(`已移动到「${projectName}」`)
  openActionMenu.value = ''
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
              <button class="row-action" type="button" aria-label="项目操作" @click.stop="toggleActionMenu(`project-${project}`)">
                <MoreFilled :size="15" />
              </button>
              <div v-if="openActionMenu === `project-${project}`" class="action-menu">
                <button type="button" @click="renameProject(project)">重命名</button>
                <button type="button" class="danger" @click="deleteProject(project)">删除</button>
              </div>
            </div>
          </div>
        </section>

        <section class="sidebar-section">
          <h2>最近的对话</h2>
          <div class="session-list">
            <div v-for="session in chatStore.sessions" :key="session.id" class="nav-row-wrap">
              <button
                class="session-item"
                :class="{ active: session.id === chatStore.activeSessionId && !isProjectHome }"
                type="button"
                @click="chatStore.switchSession(session.id); currentMode = 'chat'; isProjectHome = false; activeProject = ''"
              >
                <EditPen :size="16" />
                <span>{{ session.title }}</span>
              </button>
              <button class="row-action" type="button" aria-label="对话操作" @click.stop="toggleActionMenu(`session-${session.id}`)">
                <MoreFilled :size="15" />
              </button>
              <div v-if="openActionMenu === `session-${session.id}`" class="action-menu">
                <button type="button" @click="renameSession(session)">重命名</button>
                <button
                  v-for="project in projects"
                  :key="`${session.id}-${project}`"
                  type="button"
                  @click="moveSessionToProject(session.id, project)"
                >
                  移动到 {{ project }}
                </button>
                <button type="button" class="danger" @click="deleteSession(session.id)">删除</button>
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
          <strong>{{ isProjectMode ? activeProject : activeSession?.title }}</strong>
        </button>
        <div class="header-actions">
          <el-tooltip v-if="chatStore.isResponding" content="终止生成" placement="bottom">
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
              <button type="button" class="project-plus" @click="createProjectSession">
                <Plus :size="24" />
              </button>
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
              <button type="button">来源</button>
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
                <button type="button" aria-label="对话操作" @click.stop="toggleActionMenu(`home-session-${session.id}`)">
                  <MoreFilled :size="17" />
                </button>
                <div v-if="openActionMenu === `home-session-${session.id}`" class="action-menu home-menu">
                  <button type="button" @click.stop="renameSession(session)">重命名</button>
                  <button type="button" class="danger" @click.stop="deleteSession(session.id)">删除</button>
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
                v-if="chatStore.isResponding"
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

          <article v-if="chatStore.isResponding" class="message-row assistant">
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
              v-if="chatStore.isResponding"
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

    <div v-if="isSettingsOpen" class="settings-overlay" @click.self="closeSettings">
      <section class="settings-dialog">
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
          <label>
            <span>邮箱</span>
            <input v-model="profileEmail" placeholder="name@example.com" />
          </label>
          <label>
            <span>简介</span>
            <input v-model="profileBio" placeholder="一句话介绍自己" />
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
  </main>
</template>
