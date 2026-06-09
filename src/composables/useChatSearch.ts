import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue'
import { ElMessage } from 'element-plus'

import type { ChatMessage, ChatSession } from '@/stores/chat'
import type { SearchResult } from '@/types/ui'

interface ChatSearchOptions {
  activeProject: Ref<string>
  activeProjectSessionId: Ref<string>
  activeSession: ComputedRef<ChatSession | undefined>
  chatSessions: ChatSession[]
  closeMobileSidebar: () => void
  currentMode: Ref<'chat' | 'project'>
  getMessagePlainText: (message: ChatMessage) => string
  isPendingNewSession: Ref<boolean>
  isPendingProjectSession: Ref<boolean>
  isProjectHome: Ref<boolean>
  isProjectMode: ComputedRef<boolean>
  jumpToMessage: (messageId: string) => Promise<void>
  projectSessions: Ref<Record<string, ChatSession[]>>
  scrollToBottom: () => Promise<void>
  stopResponding: () => void
  switchSession: (sessionId: string) => void
}

const getSearchPreview = (content: string) => {
  const normalized = content.trim().replace(/\s+/g, ' ')
  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized
}

const getResultPreview = (session: ChatSession) => {
  const message = [...session.messages].reverse().find((item) => item.role === 'user') ?? session.messages.at(-1)
  return message?.content ?? '暂无消息'
}

export const useChatSearch = (options: ChatSearchOptions) => {
  const isSearchOpen = ref(false)
  const isSessionSearchOpen = ref(false)
  const searchText = ref('')
  const sessionSearchText = ref('')

  const searchResults = computed<SearchResult[]>(() => {
    const keyword = searchText.value.trim().toLowerCase()
    if (!keyword) return []

    const allSessions: Array<{ projectName?: string; session: ChatSession }> = [
      ...options.chatSessions
        .filter((session) => !session.archivedAt && !session.deletedAt)
        .map((session) => ({ projectName: undefined, session })),
      ...Object.entries(options.projectSessions.value).flatMap(([projectName, sessions]) =>
        sessions
          .filter((session) => !session.archivedAt && !session.deletedAt)
          .map((session) => ({ projectName, session })),
      ),
    ]

    return allSessions.flatMap(({ projectName, session }) => {
      const results: SearchResult[] = []
      const title = projectName ? `${projectName} / ${session.title}` : session.title
      if (session.title.toLowerCase().includes(keyword)) {
        results.push({
          id: `${projectName ?? 'chat'}-${session.id}-title`,
          preview: getSearchPreview(getResultPreview(session)),
          projectName,
          session,
          title,
          type: 'title',
        })
      }

      session.messages.forEach((message) => {
        const content = options.getMessagePlainText(message)
        if (!content.toLowerCase().includes(keyword)) return
        results.push({
          createdAt: message.createdAt,
          id: `${projectName ?? 'chat'}-${session.id}-${message.id}`,
          messageId: message.id,
          preview: getSearchPreview(content),
          projectName,
          role: message.role,
          session,
          title,
          type: 'message',
        })
      })
      return results
    })
  })

  const sessionSearchResults = computed<SearchResult[]>(() => {
    const keyword = sessionSearchText.value.trim().toLowerCase()
    const session = options.activeSession.value
    if (!keyword || !session) return []
    const title =
      options.isProjectMode.value && options.activeProject.value
        ? `${options.activeProject.value} / ${session.title}`
        : session.title

    return session.messages.flatMap((message) => {
      const content = options.getMessagePlainText(message)
      if (!content.toLowerCase().includes(keyword)) return []
      return {
        id: `current-${session.id}-${message.id}`,
        createdAt: message.createdAt,
        messageId: message.id,
        preview: getSearchPreview(content),
        projectName: options.isProjectMode.value ? options.activeProject.value : undefined,
        role: message.role,
        session,
        title,
        type: 'message',
      } satisfies SearchResult
    })
  })

  const openSearch = async () => {
    isSearchOpen.value = true
    await nextTick()
    document.querySelector<HTMLInputElement>('.search-dialog input')?.focus()
  }

  const closeSearch = () => {
    isSearchOpen.value = false
    searchText.value = ''
  }

  const openSessionSearch = async () => {
    if (!options.activeSession.value?.messages.length) {
      ElMessage.warning('当前会话还没有可搜索的消息')
      return
    }
    isSessionSearchOpen.value = true
    await nextTick()
    document.querySelector<HTMLInputElement>('.session-search-dialog input')?.focus()
  }

  const closeSessionSearch = () => {
    isSessionSearchOpen.value = false
    sessionSearchText.value = ''
  }

  const switchFromSearch = async (result: SearchResult) => {
    options.stopResponding()
    if (result.projectName) {
      options.activeProject.value = result.projectName
      options.activeProjectSessionId.value = result.session.id
      options.currentMode.value = 'project'
    } else {
      options.switchSession(result.session.id)
      options.currentMode.value = 'chat'
      options.activeProject.value = ''
      options.activeProjectSessionId.value = ''
    }
    options.isProjectHome.value = false
    options.isPendingNewSession.value = false
    options.isPendingProjectSession.value = false
    options.closeMobileSidebar()
    closeSearch()
    if (result.messageId) await options.jumpToMessage(result.messageId)
    else await options.scrollToBottom()
  }

  const switchFromSessionSearch = async (result: SearchResult) => {
    closeSessionSearch()
    if (result.messageId) await options.jumpToMessage(result.messageId)
  }

  return {
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
  }
}
