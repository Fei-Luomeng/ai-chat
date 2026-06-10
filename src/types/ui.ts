import type { ChatMessage, ChatSession } from '@/stores/chat'

// 通用确认弹窗的判别联合，type 决定其余字段是否合法。
export type ActionDialogState =
  | { type: 'create-project'; value: string }
  | { projectName: string; type: 'delete-project' | 'rename-project'; value: string }
  | { sessionId: string; type: 'delete-session' | 'rename-session'; value: string }

export interface FavoriteResult {
  // 收藏结果保存原对象引用，取消收藏时可直接修改原消息。
  id: string
  message: ChatMessage
  projectName?: string
  session: ChatSession
  title: string
}

export interface ModelSettings {
  // default* 只控制新会话初始状态，不限制用户在输入区临时切换。
  defaultAgentMode: boolean
  defaultDeepThinking: boolean
  defaultWebSearch: boolean
  maxTokens: number
  temperature: number
}

export interface MemoryItem {
  // 记忆由用户显式维护，并在发送时注入系统提示词。
  id: string
  content: string
}

export interface PromptTemplate {
  // prompt 是插入输入框的完整文本，不会直接自动发送。
  id: string
  label: string
  prompt: string
}

export interface SearchResult {
  // messageId 缺失表示标题命中，只需打开会话而无需定位消息。
  createdAt?: number
  id: string
  messageId?: string
  preview: string
  projectName?: string
  // projectName 用于区分普通会话和项目会话的跳转路径。
  role?: ChatMessage['role']
  session: ChatSession
  title: string
  type: 'title' | 'message'
}
