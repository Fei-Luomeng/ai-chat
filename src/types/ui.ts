import type { ChatMessage, ChatSession } from '@/stores/chat'

export type ActionDialogState =
  | { type: 'create-project'; value: string }
  | { projectName: string; type: 'delete-project' | 'rename-project'; value: string }
  | { sessionId: string; type: 'delete-session' | 'rename-session'; value: string }

export interface FavoriteResult {
  id: string
  message: ChatMessage
  projectName?: string
  session: ChatSession
  title: string
}

export interface ModelSettings {
  defaultAgentMode: boolean
  defaultDeepThinking: boolean
  defaultWebSearch: boolean
  maxTokens: number
  temperature: number
}

export interface MemoryItem {
  id: string
  content: string
}

export interface PromptTemplate {
  id: string
  label: string
  prompt: string
}

export interface SearchResult {
  createdAt?: number
  id: string
  messageId?: string
  preview: string
  projectName?: string
  role?: ChatMessage['role']
  session: ChatSession
  title: string
  type: 'title' | 'message'
}
