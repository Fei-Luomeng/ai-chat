import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'

import type { ChatSession } from '@/stores/chat'
import type { ActionDialogState } from '@/types/ui'

interface SendOptions {
  agentMode: boolean
  branchLabel?: string
  branchOf?: string
  deepThinking: boolean
  maxTokens?: number
  temperature: number
  webSearch: boolean
}

interface ProjectManagementOptions {
  activeProject: Ref<string>
  activeProjectSessionId: Ref<string>
  chatSessions: ChatSession[]
  closeMobileSidebar: () => void
  createId: () => string
  currentMode: Ref<'chat' | 'project'>
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
  const projects = options.projects
  const actionMenuStyle = ref<Record<string, string>>({})
  const actionDialog = ref<ActionDialogState | null>(null)

  const findProjectSession = (sessionId: string) => {
    for (const projectName of Object.keys(options.projectSessions.value)) {
      const session = options.projectSessions.value[projectName]?.find((item) => item.id === sessionId)
      if (session) return { projectName, session }
    }
    return undefined
  }

  const createProjectSession = (projectName: string) => {
    const session: ChatSession = {
      id: `project-${options.createId()}`,
      title: '新的对话',
      messages: [],
      updatedAt: Date.now(),
    }
    options.projectSessions.value = {
      ...options.projectSessions.value,
      [projectName]: [session, ...(options.projectSessions.value[projectName] ?? [])],
    }
    options.activeProjectSessionId.value = session.id
    return session
  }

  const createSession = () => {
    options.stopResponding()
    options.draft.value = ''
    options.resetTools()
    options.currentMode.value = 'chat'
    options.activeProject.value = ''
    options.activeProjectSessionId.value = ''
    options.isProjectHome.value = false
    options.isPendingNewSession.value = true
    options.isPendingProjectSession.value = false
    options.openActionMenu.value = ''
    options.closeMobileSidebar()
  }

  const selectProject = (projectName: string) => {
    options.activeProject.value = projectName
    options.resetTools()
    options.currentMode.value = 'project'
    options.isProjectHome.value = true
    options.activeProjectSessionId.value = ''
    options.isPendingNewSession.value = false
    options.isPendingProjectSession.value = false
    options.isProjectsOpen.value = true
    options.openActionMenu.value = ''
    options.closeMobileSidebar()
  }

  const switchProjectSession = (sessionId: string) => {
    options.activeProjectSessionId.value = sessionId
    options.currentMode.value = 'project'
    options.isProjectHome.value = false
    options.isPendingNewSession.value = false
    options.isPendingProjectSession.value = false
    options.openActionMenu.value = ''
    options.closeMobileSidebar()
    void options.scrollToBottom()
  }

  const selectChatSession = (sessionId: string) => {
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

    createProjectSession(options.activeProject.value)
    options.currentMode.value = 'project'
    options.isProjectHome.value = false
    options.isPendingNewSession.value = false
    options.isPendingProjectSession.value = false
    options.draft.value = ''
    await options.sendProjectContent(content, sendOptions)
  }

  const toggleActionMenu = (menuId: string, event?: MouseEvent) => {
    if (options.openActionMenu.value === menuId) {
      options.openActionMenu.value = ''
      return
    }
    options.openActionMenu.value = menuId
    const rect = (event?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect()
    if (rect) {
      actionMenuStyle.value = { left: `${rect.right + 18}px`, top: `${rect.bottom + 8}px` }
    }
  }

  const openCreateProjectDialog = () => {
    actionDialog.value = { type: 'create-project', value: '' }
    options.openActionMenu.value = ''
  }

  const renameProject = (projectName: string) => {
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
    const session = options.chatSessions.find((item) => item.id === sessionId) ?? findProjectSession(sessionId)?.session
    actionDialog.value = { type: 'delete-session', sessionId, value: session?.title ?? '这个对话' }
    options.openActionMenu.value = ''
  }

  const closeActionDialog = () => {
    actionDialog.value = null
  }

  const confirmActionDialog = () => {
    const dialog = actionDialog.value
    if (!dialog) return

    if (dialog.type === 'create-project') {
      const projectName = dialog.value.trim()
      if (projectName) {
        const nextName = projects.value.includes(projectName)
          ? `${projectName} ${projects.value.filter((item) => item.startsWith(projectName)).length + 1}`
          : projectName
        projects.value = [nextName, ...projects.value]
        options.projectSessions.value = { ...options.projectSessions.value, [nextName]: [] }
        options.projectDescriptions.value = { ...options.projectDescriptions.value, [nextName]: '' }
        selectProject(nextName)
      }
    } else if (dialog.type === 'rename-project') {
      const nextName = dialog.value.trim()
      if (nextName && nextName !== dialog.projectName) {
        projects.value = projects.value.map((item) => (item === dialog.projectName ? nextName : item))
        options.projectSessions.value = {
          ...options.projectSessions.value,
          [nextName]: options.projectSessions.value[dialog.projectName] ?? [],
        }
        options.projectDescriptions.value = {
          ...options.projectDescriptions.value,
          [nextName]: options.projectDescriptions.value[dialog.projectName] ?? '',
        }
        delete options.projectSessions.value[dialog.projectName]
        delete options.projectDescriptions.value[dialog.projectName]
        if (options.activeProject.value === dialog.projectName) options.activeProject.value = nextName
      }
    } else if (dialog.type === 'delete-project') {
      projects.value = projects.value.filter((item) => item !== dialog.projectName)
      delete options.projectSessions.value[dialog.projectName]
      delete options.projectDescriptions.value[dialog.projectName]
      if (options.activeProject.value === dialog.projectName) {
        options.activeProject.value = ''
        options.activeProjectSessionId.value = ''
        options.currentMode.value = 'chat'
        options.isProjectHome.value = false
        options.isPendingProjectSession.value = false
      }
      ElMessage.success('项目已删除')
    } else if (dialog.type === 'rename-session') {
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
      const projectMatch = findProjectSession(dialog.sessionId)
      if (projectMatch) {
        options.projectSessions.value[projectMatch.projectName] = (
          options.projectSessions.value[projectMatch.projectName] ?? []
        ).filter((session) => session.id !== dialog.sessionId)
        if (options.activeProjectSessionId.value === dialog.sessionId) {
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

  return {
    actionDialog,
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
