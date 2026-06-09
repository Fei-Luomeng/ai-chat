import { nextTick, onBeforeUnmount, onMounted, type ComputedRef, type Ref } from 'vue'

interface GlobalInteractionsOptions {
  actionDialog: Ref<unknown | null>
  closeActionDialog: () => void
  closeContextClearDialog: () => void
  closeConversationManager: () => void
  closeExportDialog: () => void
  closeFavoritesManager: () => void
  closeSearch: () => void
  closeSessionSearch: () => void
  closeSettings: () => void
  closeTemplateManager: () => void
  hasDraft: ComputedRef<boolean>
  isContextClearOpen: Ref<boolean>
  isConversationManagerOpen: Ref<boolean>
  isExportOpen: Ref<boolean>
  isFavoritesOpen: Ref<boolean>
  isMobileViewport: Ref<boolean>
  isProjectHome: Ref<boolean>
  isProjectMode: ComputedRef<boolean>
  isResponding: ComputedRef<boolean>
  isSearchOpen: Ref<boolean>
  isSessionSearchOpen: Ref<boolean>
  isSettingsOpen: Ref<boolean>
  isSidebarCollapsed: Ref<boolean>
  isTemplateManagerOpen: Ref<boolean>
  openActionMenu: Ref<string>
  openSearch: () => Promise<void>
  send: () => Promise<void>
  sendProjectMessage: () => Promise<void>
}

const MOBILE_BREAKPOINT = 780

export const useGlobalInteractions = (options: GlobalInteractionsOptions) => {
  let mobileMediaQuery: MediaQueryList | undefined

  const hasOpenDialog = () =>
    options.isSearchOpen.value ||
    options.isSessionSearchOpen.value ||
    options.isFavoritesOpen.value ||
    options.isContextClearOpen.value ||
    options.isConversationManagerOpen.value ||
    options.isTemplateManagerOpen.value ||
    options.isExportOpen.value ||
    options.isSettingsOpen.value ||
    Boolean(options.actionDialog.value)

  const focusDraftInput = async () => {
    if (hasOpenDialog()) return
    await nextTick()
    document
      .querySelector<HTMLTextAreaElement>(
        '.project-hero-composer textarea, .center-composer textarea, .composer-panel textarea',
      )
      ?.focus()
  }

  const closeTopDialog = () => {
    const dialogs: Array<[Ref<boolean>, () => void]> = [
      [options.isSearchOpen, options.closeSearch],
      [options.isSessionSearchOpen, options.closeSessionSearch],
      [options.isFavoritesOpen, options.closeFavoritesManager],
      [options.isContextClearOpen, options.closeContextClearDialog],
      [options.isConversationManagerOpen, options.closeConversationManager],
      [options.isTemplateManagerOpen, options.closeTemplateManager],
      [options.isExportOpen, options.closeExportDialog],
      [options.isSettingsOpen, options.closeSettings],
    ]
    const openDialog = dialogs.find(([state]) => state.value)
    if (openDialog) {
      openDialog[1]()
      return true
    }
    if (options.actionDialog.value) {
      options.closeActionDialog()
      return true
    }
    if (options.openActionMenu.value) {
      options.openActionMenu.value = ''
      return true
    }
    if (options.isMobileViewport.value && !options.isSidebarCollapsed.value) {
      options.isSidebarCollapsed.value = true
      return true
    }
    return false
  }

  const handleGlobalKeyDown = (event: KeyboardEvent) => {
    const isModKey = event.metaKey || event.ctrlKey
    if (isModKey && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      void options.openSearch()
    } else if (event.key === 'Escape') {
      if (closeTopDialog()) event.preventDefault()
    } else if (isModKey && event.key === 'Enter') {
      event.preventDefault()
      if (options.isResponding.value || !options.hasDraft.value || hasOpenDialog()) return
      if (options.isProjectMode.value && options.isProjectHome.value) void options.sendProjectMessage()
      else void options.send()
    } else if (
      event.key === '/' &&
      !(event.target as HTMLElement | null)?.closest(
        'input, textarea, [contenteditable="true"], .el-input, .el-textarea',
      )
    ) {
      event.preventDefault()
      void focusDraftInput()
    }
  }

  const handleGlobalPointerDown = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (options.actionDialog.value && !target.closest('.confirm-dialog')) options.closeActionDialog()
    if (options.isSettingsOpen.value && !target.closest('.settings-dialog')) options.closeSettings()
    if (
      options.openActionMenu.value &&
      !target.closest('.action-menu') &&
      !target.closest('.row-action') &&
      !target.closest('.project-chat-row > button')
    ) {
      options.openActionMenu.value = ''
    }
  }

  const handleViewportChange = (event: MediaQueryListEvent) => {
    options.isMobileViewport.value = event.matches
    options.isSidebarCollapsed.value = event.matches
  }

  onMounted(() => {
    mobileMediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    mobileMediaQuery.addEventListener('change', handleViewportChange)
    document.addEventListener('pointerdown', handleGlobalPointerDown, true)
    document.addEventListener('keydown', handleGlobalKeyDown)
  })

  onBeforeUnmount(() => {
    mobileMediaQuery?.removeEventListener('change', handleViewportChange)
    document.removeEventListener('pointerdown', handleGlobalPointerDown, true)
    document.removeEventListener('keydown', handleGlobalKeyDown)
  })

  return { focusDraftInput }
}
