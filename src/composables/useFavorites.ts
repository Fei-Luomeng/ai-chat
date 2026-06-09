import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { ElMessage } from 'element-plus'

import type { ChatMessage, ChatSession } from '@/stores/chat'
import type { FavoriteResult } from '@/types/ui'

interface FavoritesOptions {
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
  const isFavoritesOpen = ref(false)
  const favoriteSearchText = ref('')
  const favoriteScope = ref('all')

  const favoriteResults = computed<FavoriteResult[]>(() => [
    ...options.chatSessions
      .filter((session) => !session.archivedAt && !session.deletedAt)
      .flatMap((session) =>
      session.messages
        .filter((message) => message.role === 'assistant' && message.favorited)
        .map((message) => ({ id: `chat-${session.id}-${message.id}`, message, session, title: session.title })),
      ),
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
    ...Array.from(new Set(favoriteResults.value.map((favorite) => favorite.projectName).filter(Boolean)))
      .sort((left, right) => left!.localeCompare(right!, 'zh-CN'))
      .map((projectName) => ({ label: projectName!, value: `project:${projectName}` })),
  ])

  const filteredFavoriteResults = computed(() => {
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
    message.favorited = !message.favorited
    const session = options.activeSession.value
    if (session) session.updatedAt = Date.now()
    if (options.isProjectMode.value) options.persistAppState()
    else options.persistChatSessions()
    ElMessage.success(message.favorited ? '已收藏回答' : '已取消收藏')
  }

  const switchFromFavorite = async (favorite: FavoriteResult) => {
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
    favoriteSearchText.value = ''
    favoriteScope.value = 'all'
    isFavoritesOpen.value = true
    options.closeMobileSidebar()
  }

  const closeFavoritesManager = () => {
    isFavoritesOpen.value = false
  }

  const removeFavorite = (favorite: FavoriteResult) => {
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
