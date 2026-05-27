import { defineStore } from 'pinia'

export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: number
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
}

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好，我是你的 AI 助手。可以帮你整理想法、写代码、润色文案，或者陪你拆解一个复杂问题。',
  createdAt: Date.now(),
}

const starterSession: ChatSession = {
  id: 'session-1',
  title: '新的对话',
  messages: [welcomeMessage],
  updatedAt: Date.now(),
}

const sampleSessions: ChatSession[] = [
  {
    id: 'session-interview',
    title: '前端面试复习计划',
    messages: [
      {
        ...welcomeMessage,
        id: 'welcome-interview',
      },
      {
        id: 'interview-user',
        role: 'user',
        content: '帮我整理一份前端面试复习计划，重点放在组件、状态管理和工程化。',
        createdAt: Date.now() - 1000 * 60 * 40,
      },
    ],
    updatedAt: Date.now() - 1000 * 60 * 35,
  },
  {
    id: 'session-resume',
    title: '简历项目经历润色',
    messages: [
      {
        ...welcomeMessage,
        id: 'welcome-resume',
      },
      {
        id: 'resume-user',
        role: 'user',
        content: '帮我把 AI Chat 这个项目写成简历里的项目经历。',
        createdAt: Date.now() - 1000 * 60 * 80,
      },
    ],
    updatedAt: Date.now() - 1000 * 60 * 74,
  },
]

const createId = () => crypto.randomUUID()

const summarizeTitle = (content: string) => {
  const normalized = content.trim().replace(/\s+/g, ' ')
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || '新的对话'
}

let responseTimer: ReturnType<typeof window.setTimeout> | null = null

export const useChatStore = defineStore('chat', {
  state: () => ({
    sessions: [starterSession, ...sampleSessions] as ChatSession[],
    activeSessionId: starterSession.id,
    isResponding: false,
  }),
  getters: {
    activeSession: (state) => state.sessions.find((session) => session.id === state.activeSessionId) ?? state.sessions[0],
  },
  actions: {
    createSession() {
      const now = Date.now()
      const session: ChatSession = {
        id: createId(),
        title: '新的对话',
        messages: [
          {
            ...welcomeMessage,
            id: createId(),
            createdAt: now,
          },
        ],
        updatedAt: now,
      }

      this.sessions.unshift(session)
      this.activeSessionId = session.id
      return session.id
    },
    switchSession(sessionId: string) {
      this.activeSessionId = sessionId
    },
    renameSession(sessionId: string, title: string) {
      const session = this.sessions.find((item) => item.id === sessionId)
      const normalized = title.trim()
      if (!session || !normalized) return

      session.title = normalized
      session.updatedAt = Date.now()
    },
    deleteSession(sessionId: string) {
      if (this.sessions.length <= 1) return

      const index = this.sessions.findIndex((session) => session.id === sessionId)
      if (index === -1) return

      this.sessions.splice(index, 1)
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = this.sessions[0]?.id ?? ''
      }
    },
    clearActiveSession() {
      const session = this.activeSession
      if (!session) return

      this.stopResponding()

      const now = Date.now()
      session.title = '新的对话'
      session.messages = [
        {
          ...welcomeMessage,
          id: createId(),
          createdAt: now,
        },
      ]
      session.updatedAt = now
    },
    async sendMessage(content: string) {
      const session = this.activeSession
      const trimmedContent = content.trim()

      if (!session || !trimmedContent || this.isResponding) return

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
      this.isResponding = true

      await new Promise<void>((resolve) => {
        responseTimer = window.setTimeout(() => {
          responseTimer = null
          resolve()
        }, 900)
      })

      if (!this.isResponding) return

      session.messages.push({
        id: createId(),
        role: 'assistant',
        content: this.composeAssistantReply(trimmedContent),
        createdAt: Date.now(),
      })
      session.updatedAt = Date.now()
      this.isResponding = false
    },
    stopResponding() {
      if (responseTimer) {
        window.clearTimeout(responseTimer)
        responseTimer = null
      }

      this.isResponding = false
    },
    composeAssistantReply(content: string) {
      return [
        `我收到你的问题：「${content}」。`,
        '当前项目已经预留了聊天状态、会话切换和消息发送结构。之后可以把这里替换成真实的大模型 API 调用，并增加流式输出、上下文裁剪和错误重试。',
      ].join('\n\n')
    },
  },
})
