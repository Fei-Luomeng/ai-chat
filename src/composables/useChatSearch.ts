import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue'
import { ElMessage } from 'element-plus'

import type { ChatMessage, ChatSession } from '@/stores/chat'
import type { SearchResult } from '@/types/ui'

interface ChatSearchOptions {
  // 搜索结果跳转需要同时控制导航模式、活动会话和消息滚动。
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
  // 搜索卡片使用单行摘要，先压缩 Markdown 文本中的连续空白。
  const normalized = content.trim().replace(/\s+/g, ' ')
  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized
}

const getResultPreview = (session: ChatSession) => {
  // 会话级结果优先展示最近一次用户问题。
  const message = [...session.messages].reverse().find((item) => item.role === 'user') ?? session.messages.at(-1)
  return message?.content ?? '暂无消息'
}

export const useChatSearch = (options: ChatSearchOptions) => {
  // 全局搜索跨普通会话和项目；会话内搜索只扫描当前 session。
  const isSearchOpen = ref(false)
  const isSessionSearchOpen = ref(false)
  const searchText = ref('')
  const sessionSearchText = ref('')

  // computed 会自动收集回调中读取的响应式依赖。
  // searchText 或 projectSessions 变化时重新计算，其他时间直接复用缓存结果。
  const searchResults = computed<SearchResult[]>(() => {
    const keyword = searchText.value.trim().toLowerCase()
    if (!keyword) return []

    // 先拉平成统一结构，结果再携带 projectName 用于恢复正确导航模式。
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

    // flatMap 允许每个会话返回多条结果，并自动把二维数组展开为一维数组。
    return allSessions.flatMap(({ projectName, session }) => {
      // 同一会话可以同时产生一个标题结果和多个消息结果。
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
        // 助手消息通过 getMessagePlainText 排除思考过程后再搜索。
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
    // 当前会话搜索无需重新切换 session，但仍保留统一 SearchResult 结构。
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
      // satisfies 只校验对象满足 SearchResult，不会把每个字段都强制扩大成接口中的宽类型。
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
    // 弹窗挂载完成后再聚焦输入框。
    isSearchOpen.value = true
    // v-if 依赖 isSearchOpen，必须等待下一次 DOM 更新后 input 才存在。
    await nextTick()
    document.querySelector<HTMLInputElement>('.search-dialog input')?.focus()
  }

  const closeSearch = () => {
    // 关闭时清空关键词，下次打开回到初始引导状态。
    isSearchOpen.value = false
    searchText.value = ''
  }

  const openSessionSearch = async () => {
    // 空会话不打开无意义的搜索弹窗。
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
    // 搜索跳转会终止旧页面的生成，避免响应写入已经离开的会话界面。
    options.stopResponding()
    if (result.projectName) {
      // 项目结果需要恢复项目名和项目会话 id。
      options.activeProject.value = result.projectName
      options.activeProjectSessionId.value = result.session.id
      options.currentMode.value = 'project'
    } else {
      // 普通结果要清除项目导航，避免刷新时错误恢复到项目模式。
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
    // 标题命中只打开会话，消息命中继续定位到具体消息。
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
