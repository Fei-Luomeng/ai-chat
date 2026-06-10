import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { ElMessage } from 'element-plus'

import type { ChatMessage, ChatSession } from '@/stores/chat'
import type { FavoriteResult } from '@/types/ui'

interface FavoritesOptions {
  // 收藏跨普通会话和项目会话，因此依赖两套持久化入口。
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
  persistAppState: () => void
  persistChatSessions: () => void
  projectSessions: Ref<Record<string, ChatSession[]>>
  stopResponding: () => void
  switchSession: (sessionId: string) => void
}

export const useFavorites = (options: FavoritesOptions) => {
  // 收藏标记直接存放在原消息上，管理页只生成跨会话的索引视图。
  const isFavoritesOpen = ref(false)
  const favoriteSearchText = ref('')
  const favoriteScope = ref('all')

  const favoriteResults = computed<FavoriteResult[]>(() => [
    // 普通会话收藏不带 projectName。
    ...options.chatSessions
      .filter((session) => !session.archivedAt && !session.deletedAt)
      .flatMap((session) =>
      session.messages
        .filter((message) => message.role === 'assistant' && message.favorited)
        .map((message) => ({ id: `chat-${session.id}-${message.id}`, message, session, title: session.title })),
      ),
    // 项目收藏附带项目名，跳转时据此恢复项目模式。
    ...Object.entries(options.projectSessions.value).flatMap(([projectName, sessions]) =>
      sessions
        .filter((session) => !session.archivedAt && !session.deletedAt)
        .flatMap((session) =>
        session.messages
          .filter((message) => message.role === 'assistant' && message.favorited)
          .map((message) => ({
            id: `${projectName}-${session.id}-${message.id}`,
            message,
            projectName,
            session,
            title: `${projectName} / ${session.title}`,
          })),
        ),
    ),
  ])

  const favoriteScopeOptions = computed(() => [
    { label: '全部收藏', value: 'all' },
    { label: '普通对话', value: 'chat' },
    // 项目筛选项根据现有收藏动态生成，不额外维护一份项目列表。
    ...Array.from(new Set(favoriteResults.value.map((favorite) => favorite.projectName).filter(Boolean)))
      .sort((left, right) => left!.localeCompare(right!, 'zh-CN'))
      .map((projectName) => ({ label: projectName!, value: `project:${projectName}` })),
  ])

  const filteredFavoriteResults = computed(() => {
    // 范围和关键词两个条件同时满足才展示。
    const keyword = favoriteSearchText.value.trim().toLowerCase()
    return favoriteResults.value.filter((favorite) => {
      const matchesScope =
        favoriteScope.value === 'all' ||
        (favoriteScope.value === 'chat' && !favorite.projectName) ||
        favoriteScope.value === `project:${favorite.projectName}`
      const matchesKeyword =
        !keyword ||
        favorite.title.toLowerCase().includes(keyword) ||
        options.getMessagePlainText(favorite.message).toLowerCase().includes(keyword)
      return matchesScope && matchesKeyword
    })
  })

  const toggleMessageFavorite = (message: ChatMessage) => {
    // favorite 直接写回原消息，收藏列表会由 computed 自动更新。
    message.favorited = !message.favorited
    const session = options.activeSession.value
    if (session) session.updatedAt = Date.now()
    if (options.isProjectMode.value) options.persistAppState()
    else options.persistChatSessions()
    ElMessage.success(message.favorited ? '已收藏回答' : '已取消收藏')
  }

  const switchFromFavorite = async (favorite: FavoriteResult) => {
    // 先恢复收藏所属的会话和模式，再让 jumpToMessage 处理分支与渲染窗口。
    options.stopResponding()
    if (favorite.projectName) {
      options.activeProject.value = favorite.projectName
      options.activeProjectSessionId.value = favorite.session.id
      options.currentMode.value = 'project'
    } else {
      options.switchSession(favorite.session.id)
      options.currentMode.value = 'chat'
      options.activeProject.value = ''
      options.activeProjectSessionId.value = ''
    }
    options.isProjectHome.value = false
    options.isPendingNewSession.value = false
    options.isPendingProjectSession.value = false
    options.closeMobileSidebar()
    await options.jumpToMessage(favorite.message.id)
  }

  const openFavoritesManager = () => {
    // 每次打开重置筛选，避免用户误以为收藏丢失。
    favoriteSearchText.value = ''
    favoriteScope.value = 'all'
    isFavoritesOpen.value = true
    options.closeMobileSidebar()
  }

  const closeFavoritesManager = () => {
    isFavoritesOpen.value = false
  }

  const removeFavorite = (favorite: FavoriteResult) => {
    // 管理页取消收藏后不删除消息本身。
    favorite.message.favorited = false
    favorite.session.updatedAt = Date.now()
    if (favorite.projectName) options.persistAppState()
    else options.persistChatSessions()
    ElMessage.success('已取消收藏')
  }

  return {
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
  }
}
