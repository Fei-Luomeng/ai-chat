import { nextTick, onBeforeUnmount, onMounted, type ComputedRef, type Ref } from 'vue'

interface GlobalInteractionsOptions {
  // Ref/ComputedRef 作为参数传入后仍保持响应式，并不是传入当前值的副本。
  // 因此本 composable 修改 options.isSidebarCollapsed.value 时，App.vue 会同步更新。
  // 关闭函数由各功能模块提供，本模块只负责决定调用顺序。
  // unknown | null 表示内容类型不由本模块关心，但仍明确允许空状态。
  // unknown 比 any 严格：如果本模块真要读取其属性，必须先判断类型。
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
  // () => Promise<void> 表示一个无参数异步函数，调用方可以选择 await 等待完成。
  openSearch: () => Promise<void>
  send: () => Promise<void>
  sendProjectMessage: () => Promise<void>
}

const MOBILE_BREAKPOINT = 780

export const useGlobalInteractions = (options: GlobalInteractionsOptions) => {
  // 集中注册全局事件，避免多个组件各自监听 document 后产生冲突。
  let mobileMediaQuery: MediaQueryList | undefined

  const hasOpenDialog = () =>
    // 使用 || 串联，只要任意一项为 true 就立即返回 true。
    // 快捷发送和自动聚焦在任意弹窗打开时都应暂停。
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
    // 页面最多只会有一个可见输入器，按视图优先级查询。
    if (hasOpenDialog()) return
    // 修改响应式状态后 DOM 不会在当前同步语句中立刻更新。
    // nextTick 等待 Vue 完成本轮渲染，之后才能查询刚显示出来的输入框。
    await nextTick()
    document
      .querySelector<HTMLTextAreaElement>(
        '.project-hero-composer textarea, .center-composer textarea, .composer-panel textarea',
      )
      ?.focus()
  }

  const closeTopDialog = () => {
    // Escape 每次只关闭优先级最高的一层界面。
    // `[Ref<boolean>, () => void]` 是元组：长度和每个位置的类型固定，
    // 第 0 项一定是布尔 ref，第 1 项一定是关闭函数，不能互换顺序。
    // Array<[A, B]> 表示“由这种固定两个元素的元组组成的数组”。
    // 每一项同时保存弹窗开关 Ref 和对应关闭函数。
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
    // find 返回第一个打开项，所以数组顺序同时代表 Escape 关闭优先级。
    const openDialog = dialogs.find(([state]) => state.value)
    if (openDialog) {
      // 找到第一层后立即返回，避免一次 Escape 关闭多个弹窗。
      openDialog[1]()
      return true
    }
    if (options.actionDialog.value) {
      // 通用确认框的状态不是 boolean，因此单独处理。
      options.closeActionDialog()
      return true
    }
    if (options.openActionMenu.value) {
      // 没有弹窗时 Escape 继续关闭行操作菜单。
      options.openActionMenu.value = ''
      return true
    }
    if (options.isMobileViewport.value && !options.isSidebarCollapsed.value) {
      // 移动端最后关闭侧栏抽屉。
      options.isSidebarCollapsed.value = true
      return true
    }
    return false
  }

  const handleGlobalKeyDown = (event: KeyboardEvent) => {
    // Cmd/Ctrl+K 搜索、Cmd/Ctrl+Enter 发送、/ 聚焦输入框。
    // macOS 使用 Command(metaKey)，Windows/Linux 通常使用 Ctrl(ctrlKey)。
    const isModKey = event.metaKey || event.ctrlKey
    if (isModKey && event.key.toLowerCase() === 'k') {
      // 覆盖浏览器默认搜索，打开应用全局搜索。
      event.preventDefault()
      void options.openSearch()
    } else if (event.key === 'Escape') {
      if (closeTopDialog()) event.preventDefault()
    } else if (isModKey && event.key === 'Enter') {
      event.preventDefault()
      if (options.isResponding.value || !options.hasDraft.value || hasOpenDialog()) return
      // 项目首页没有 active session，使用专门的创建并发送流程。
      if (options.isProjectMode.value && options.isProjectHome.value) void options.sendProjectMessage()
      else void options.send()
    } else if (
      event.key === '/' &&
      // closest 判断焦点是否位于输入控件内，防止正常输入“/”被快捷键拦截。
      !(event.target as HTMLElement | null)?.closest(
        'input, textarea, [contenteditable="true"], .el-input, .el-textarea',
      )
    ) {
      // 用户在表单控件内输入“/”时保留正常字符输入。
      event.preventDefault()
      void focusDraftInput()
    }
  }

  const handleGlobalPointerDown = (event: PointerEvent) => {
    // 使用捕获阶段，使点击外部关闭不受子组件 stopPropagation 影响。
    const target = event.target as HTMLElement | null
    if (!target) return
    // closest 找不到弹窗容器说明点击发生在弹窗外部。
    if (options.actionDialog.value && !target.closest('.confirm-dialog')) options.closeActionDialog()
    // 设置弹窗允许点击遮罩关闭，其他弹窗主要由自身遮罩事件处理。
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
    // 跨过断点时同步抽屉状态，手机端默认关闭，桌面端默认展开。
    options.isMobileViewport.value = event.matches
    options.isSidebarCollapsed.value = event.matches
  }

  onMounted(() => {
    // onMounted 在组件真实挂载到页面后运行，适合访问 window、document 和 DOM。
    // composable 中调用生命周期钩子时，它会自动绑定到调用该 composable 的组件。
    // matchMedia 比 resize 更直接地表达断点变化。
    mobileMediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    mobileMediaQuery.addEventListener('change', handleViewportChange)
    document.addEventListener('pointerdown', handleGlobalPointerDown, true)
    document.addEventListener('keydown', handleGlobalKeyDown)
  })

  onBeforeUnmount(() => {
    // 注册全局事件后必须在卸载前移除，否则组件重新进入时会重复注册监听。
    // document 监听必须成对移除，避免热更新后重复触发。
    mobileMediaQuery?.removeEventListener('change', handleViewportChange)
    document.removeEventListener('pointerdown', handleGlobalPointerDown, true)
    document.removeEventListener('keydown', handleGlobalKeyDown)
  })

  return { focusDraftInput }
}
