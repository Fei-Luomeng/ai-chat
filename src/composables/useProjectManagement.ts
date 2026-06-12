import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'

import type { ChatSession } from '@/stores/chat'
import type { ActionDialogState } from '@/types/ui'

interface SendOptions {
  // 与 useChatApp 的发送参数保持结构兼容，避免项目模块依赖具体 Store。
  agentMode: boolean
  branchLabel?: string
  branchOf?: string
  deepThinking: boolean
  maxTokens?: number
  systemPrompt?: string
  temperature: number
  webSearch: boolean
}

interface ProjectManagementOptions {
  // Options 接口把这个 composable 需要的依赖一次列全，类似 Vue 2 mixin 的依赖清单，
  // 但 TS 会在调用处检查是否漏传、名称是否拼错、函数参数是否一致。
  // 导航状态由外层创建并注入，此模块直接修改这些 Ref。
  // 这种“状态 + 回调注入”让模块不需要 import useChatApp，也避免模块之间循环依赖。
  activeProject: Ref<string>
  activeProjectSessionId: Ref<string>
  chatSessions: ChatSession[]
  closeMobileSidebar: () => void
  createId: () => string
  currentMode: Ref<'chat' | 'project'>
  // 普通会话操作通过回调委托给 Pinia，项目会话则由本模块直接修改映射。
  archiveChatSession: (sessionId: string) => void
  deleteChatSession: (sessionId: string) => void
  draft: Ref<string>
  getSendOptions: () => SendOptions
  isPendingNewSession: Ref<boolean>
  isPendingProjectSession: Ref<boolean>
  isProjectHome: Ref<boolean>
  isProjectsOpen: Ref<boolean>
  openActionMenu: Ref<string>
  projectDescriptions: Ref<Record<string, string>>
  projects: Ref<string[]>
  projectSessions: Ref<Record<string, ChatSession[]>>
  renameChatSession: (sessionId: string, title: string) => void
  resetTools: () => void
  scrollToBottom: () => Promise<void>
  sendProjectContent: (content: string, sendOptions: SendOptions) => Promise<void>
  stopResponding: () => void
  switchChatSession: (sessionId: string) => void
}

export const useProjectManagement = (options: ProjectManagementOptions) => {
  // 此 composable 只维护导航和项目 CRUD，实际 AI 请求由外层注入。
  // projects 没有复制数组，只是给同一个 Ref 起了一个更短的局部名称。
  const projects = options.projects
  // actionMenuStyle 使用 fixed 坐标；actionDialog 保存当前待确认操作。
  // 样式对象的键和值都是字符串，例如 `{ left: '120px', top: '80px' }`。
  // 使用 Record 是因为具体会出现哪些 CSS 字段不固定。
  const actionMenuStyle = ref<Record<string, string>>({})
  // 联合类型包含 null，表示“当前没有待处理弹窗”；赋值为对象后 TS 会检查联合成员结构。
  const actionDialog = ref<ActionDialogState | null>(null)

  const findProjectSession = (sessionId: string) => {
    // 没有显式写返回值时，TS 会根据两个 return 自动推断为
    // `{ projectName: string; session: ChatSession } | undefined`。
    // 项目会话按项目名分组，操作单条会话时需要先反查所属项目。
    // projectSessions 的结构是 Record<项目名, 会话数组>，所以需要遍历每个项目查找。
    for (const projectName of Object.keys(options.projectSessions.value)) {
      const session = options.projectSessions.value[projectName]?.find((item) => item.id === sessionId)
      if (session) return { projectName, session }
    }
    return undefined
  }

  const createProjectSession = (projectName: string) => {
    // 项目会话 id 使用前缀，调试存储数据时能快速区分来源。
    const session: ChatSession = {
      id: `project-${options.createId()}`,
      title: '新的对话',
      messages: [],
      updatedAt: Date.now(),
    }
    options.projectSessions.value = {
      // 创建新对象确保依赖整个映射的 computed/watch 能被触发。
      ...options.projectSessions.value,
      // 计算属性名：[projectName] 会把变量值作为对象键，而不是创建名为 projectName 的固定字段。
      [projectName]: [session, ...(options.projectSessions.value[projectName] ?? [])],
    }
    options.activeProjectSessionId.value = session.id
    return session
  }

  const createSession = () => {
    // 新建普通对话先进入临时空白态，首条消息发送时才真正创建 session。
    options.stopResponding()
    options.draft.value = ''
    options.resetTools()
    // 普通模式和项目模式相关字段必须成组更新，避免左侧和主区域状态不一致。
    options.currentMode.value = 'chat'
    options.activeProject.value = ''
    options.activeProjectSessionId.value = ''
    options.isProjectHome.value = false
    // pending 状态只负责显示空白欢迎页，不马上向 sessions 插入空会话，
    // 避免用户连续点击“新建对话”产生大量没有消息的记录。
    options.isPendingNewSession.value = true
    options.isPendingProjectSession.value = false
    options.openActionMenu.value = ''
    options.closeMobileSidebar()
  }

  const selectProject = (projectName: string) => {
    // 点击项目默认进入项目首页，不自动选择其中某条历史会话。
    options.activeProject.value = projectName
    options.resetTools()
    options.currentMode.value = 'project'
    options.isProjectHome.value = true
    // 项目首页没有具体活动会话，所以主动清空 activeProjectSessionId。
    options.activeProjectSessionId.value = ''
    options.isPendingNewSession.value = false
    options.isPendingProjectSession.value = false
    options.isProjectsOpen.value = true
    options.openActionMenu.value = ''
    options.closeMobileSidebar()
  }

  const switchProjectSession = (sessionId: string) => {
    // 进入具体会话后必须关闭项目首页状态。
    options.activeProjectSessionId.value = sessionId
    options.currentMode.value = 'project'
    options.isProjectHome.value = false
    options.isPendingNewSession.value = false
    options.isPendingProjectSession.value = false
    options.openActionMenu.value = ''
    options.closeMobileSidebar()
    // 会话切换完成后让消息区定位到最新内容。
    // void 表示不等待滚动 Promise，不阻塞当前点击处理。
    void options.scrollToBottom()
  }

  const selectChatSession = (sessionId: string) => {
    // 普通会话和项目导航字段互斥，切换时完整清理项目位置。
    options.switchChatSession(sessionId)
    options.currentMode.value = 'chat'
    options.isProjectHome.value = false
    options.activeProject.value = ''
    options.activeProjectSessionId.value = ''
    options.isPendingNewSession.value = false
    options.isPendingProjectSession.value = false
    options.closeMobileSidebar()
  }

  const sendProjectMessage = async () => {
    if (!options.activeProject.value) return
    const content = options.draft.value.trim()
    if (!content) return
    const sendOptions = options.getSendOptions()

    // 从项目首页发送首条消息时创建项目会话并切换到对话视图。
    // 先创建会话并设置活动 id，再发送，流式 token 才有正确的目标 session。
    createProjectSession(options.activeProject.value)
    options.currentMode.value = 'project'
    options.isProjectHome.value = false
    options.isPendingNewSession.value = false
    options.isPendingProjectSession.value = false
    options.draft.value = ''
    await options.sendProjectContent(content, sendOptions)
  }

  const toggleActionMenu = (menuId: string, event?: MouseEvent) => {
    // 参数名后的 ? 表示调用函数时可以不传 event；因此函数内部 event 可能是 undefined。
    // 再次点击同一按钮视为关闭。
    if (options.openActionMenu.value === menuId) {
      options.openActionMenu.value = ''
      return
    }
    options.openActionMenu.value = menuId
    // currentTarget 是绑定事件的按钮；target 可能是按钮内部的图标。
    // 从左往右读：event?. 在 event 为空时直接得到 undefined；
    // `as HTMLElement | undefined` 告诉 TS 非空时按 HTML 元素处理；
    // 最后的 ?. 又保证没有元素时不会调用 getBoundingClientRect。
    const rect = (event?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect()
    if (rect) {
      // 菜单挂在根节点上，用触发按钮的视口坐标定位。
      actionMenuStyle.value = { left: `${rect.right + 18}px`, top: `${rect.bottom + 8}px` }
    }
  }

  const openCreateProjectDialog = () => {
    // 菜单打开弹窗后立即关闭，避免两层浮层同时存在。
    actionDialog.value = { type: 'create-project', value: '' }
    options.openActionMenu.value = ''
  }

  const renameProject = (projectName: string) => {
    // value 预填当前名称，用户可直接在原文字基础上修改。
    actionDialog.value = { type: 'rename-project', projectName, value: projectName }
    options.openActionMenu.value = ''
  }

  const deleteProject = (projectName: string) => {
    actionDialog.value = { type: 'delete-project', projectName, value: projectName }
    options.openActionMenu.value = ''
  }

  const renameSession = (session: ChatSession) => {
    actionDialog.value = { type: 'rename-session', sessionId: session.id, value: session.title }
    options.openActionMenu.value = ''
  }

  const deleteSession = (sessionId: string) => {
    // 同一删除入口兼容普通会话和项目会话。
    // 先找普通会话，找不到再查项目；?? 只在左侧 undefined 时继续使用右侧。
    const session = options.chatSessions.find((item) => item.id === sessionId) ?? findProjectSession(sessionId)?.session
    actionDialog.value = { type: 'delete-session', sessionId, value: session?.title ?? '这个对话' }
    options.openActionMenu.value = ''
  }

  const archiveSession = (sessionId: string) => {
    // 先查项目映射，未命中才委托普通会话 Store。
    // 项目和普通会话共用 UI 命令，但底层存储位置不同。
    const projectMatch = findProjectSession(sessionId)
    if (projectMatch) {
      projectMatch.session.archivedAt = Date.now()
      projectMatch.session.deletedAt = undefined
      projectMatch.session.updatedAt = Date.now()
      if (options.activeProjectSessionId.value === sessionId) {
        // 当前项目会话被归档后返回项目首页。
        options.activeProjectSessionId.value = ''
        options.isProjectHome.value = true
      }
    } else {
      options.archiveChatSession(sessionId)
    }
    options.openActionMenu.value = ''
    ElMessage.success('对话已归档')
  }

  const closeActionDialog = () => {
    actionDialog.value = null
  }

  const confirmActionDialog = () => {
    // 所有重命名和删除共用一个对话框，通过 type 分发具体的数据修改。
    const dialog = actionDialog.value
    if (!dialog) return

    // 先判断 type 后，TypeScript 会把 dialog 缩小到对应的联合成员，
    // 因此 rename 分支可以安全读取 projectName，session 分支可以读取 sessionId。
    if (dialog.type === 'create-project') {
      const projectName = dialog.value.trim()
      if (projectName) {
        // 重名项目追加序号，避免覆盖以项目名为键的数据。
        const nextName = projects.value.includes(projectName)
          ? `${projectName} ${projects.value.filter((item) => item.startsWith(projectName)).length + 1}`
          : projectName
        // 新项目放在数组开头，使它立即出现在侧边栏顶部。
        projects.value = [nextName, ...projects.value]
        // 新项目同时初始化会话列表和说明字段。
        options.projectSessions.value = { ...options.projectSessions.value, [nextName]: [] }
        options.projectDescriptions.value = { ...options.projectDescriptions.value, [nextName]: '' }
        selectProject(nextName)
      }
    } else if (dialog.type === 'rename-project') {
      const nextName = dialog.value.trim()
      if (nextName && nextName !== dialog.projectName) {
        projects.value = projects.value.map((item) => (item === dialog.projectName ? nextName : item))
        // 重命名项目本质上是把两个 Record 中旧键的数据迁移到新键。
        options.projectSessions.value = {
          ...options.projectSessions.value,
          [nextName]: options.projectSessions.value[dialog.projectName] ?? [],
        }
        options.projectDescriptions.value = {
          ...options.projectDescriptions.value,
          [nextName]: options.projectDescriptions.value[dialog.projectName] ?? '',
        }
        // 项目名同时是两个映射的键，重命名必须迁移会话和项目说明。
        // delete 删除的是对象中的旧键，不是删除 Ref 本身。
        delete options.projectSessions.value[dialog.projectName]
        delete options.projectDescriptions.value[dialog.projectName]
        if (options.activeProject.value === dialog.projectName) options.activeProject.value = nextName
      }
    } else if (dialog.type === 'delete-project') {
      // 删除项目会直接移除其全部本地会话，目前不进入回收站。
      projects.value = projects.value.filter((item) => item !== dialog.projectName)
      delete options.projectSessions.value[dialog.projectName]
      delete options.projectDescriptions.value[dialog.projectName]
      if (options.activeProject.value === dialog.projectName) {
        // 删除当前项目后退回普通聊天模式。
        options.activeProject.value = ''
        options.activeProjectSessionId.value = ''
        options.currentMode.value = 'chat'
        options.isProjectHome.value = false
        options.isPendingProjectSession.value = false
      }
      ElMessage.success('项目已删除')
    } else if (dialog.type === 'rename-session') {
      // 项目会话直接修改对象，普通会话交给 Store 方法。
      const projectMatch = findProjectSession(dialog.sessionId)
      if (projectMatch) {
        const normalized = dialog.value.trim()
        if (normalized) {
          projectMatch.session.title = normalized
          projectMatch.session.updatedAt = Date.now()
        }
      } else {
        options.renameChatSession(dialog.sessionId, dialog.value)
      }
    } else if (dialog.type === 'delete-session') {
      // 删除会话采用软删除，之后可从回收站恢复。
      const projectMatch = findProjectSession(dialog.sessionId)
      if (projectMatch) {
        projectMatch.session.deletedAt = Date.now()
        projectMatch.session.archivedAt = undefined
        projectMatch.session.updatedAt = Date.now()
        if (options.activeProjectSessionId.value === dialog.sessionId) {
          // 删除当前项目会话后仍停留在同一项目首页。
          options.activeProjectSessionId.value = ''
          options.isProjectHome.value = true
        }
      } else {
        options.deleteChatSession(dialog.sessionId)
      }
      ElMessage.success('对话已删除')
    }
    actionDialog.value = null
  }

  // 返回给 useChatApp 的都是页面命令和弹窗状态；查找辅助函数保持私有。
  return {
    actionDialog,
    archiveSession,
    actionMenuStyle,
    closeActionDialog,
    confirmActionDialog,
    createProjectSession,
    createSession,
    deleteProject,
    deleteSession,
    openCreateProjectDialog,
    projects,
    renameProject,
    renameSession,
    selectChatSession,
    selectProject,
    sendProjectMessage,
    switchProjectSession,
    toggleActionMenu,
  }
}
