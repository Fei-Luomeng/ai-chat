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

const createId = () => crypto.randomUUID()

const summarizeTitle = (content: string) => {
  const normalized = content.trim().replace(/\s+/g, ' ')
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || '新的对话'
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    sessions: [starterSession] as ChatSession[],
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
    },
    switchSession(sessionId: string) {
      this.activeSessionId = sessionId
    },
    clearActiveSession() {
      const session = this.activeSession
      if (!session) return

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

      await new Promise((resolve) => window.setTimeout(resolve, 650))

      session.messages.push({
        id: createId(),
        role: 'assistant',
        content: this.composeAssistantReply(trimmedContent),
        createdAt: Date.now(),
      })
      session.updatedAt = Date.now()
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
