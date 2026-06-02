import { defineStore } from 'pinia'

export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  reasoningContent?: string
  reasoningEndedAt?: number
  reasoningStartedAt?: number
  createdAt: number
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
}

interface SendOptions {
  deepThinking?: boolean
  webSearch?: boolean
}

interface RequestAssistantOptions extends SendOptions {
  onReasoning?: (token: string) => void | Promise<void>
  onToken?: (token: string) => void | Promise<void>
  signal?: AbortSignal
  systemPrompt?: string
}

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好，我是你的 AI 助手。可以帮你整理想法、写代码、润色文案，或者陪你拆解一个复杂问题。',
  createdAt: Date.now(),
}

const createId = () => crypto.randomUUID()
const BIGMODEL_API_KEY = 'b236db0425f94a2db8743cf915e12c3f.FE9eFM5sv1BMn5OU'
const BIGMODEL_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const BIGMODEL_MODEL = 'glm-4.7-flash'
const CONTEXT_MESSAGE_LIMIT = 20
const CONTEXT_CHAR_LIMIT = 12000
const NORMAL_OUTPUT_TOKEN_LIMIT = 4096
const DEEP_THINKING_OUTPUT_TOKEN_LIMIT = 8192
const SYSTEM_PROMPT = '你是 AI Chat，一个简洁、可靠的中文 AI 助手。回答要自然、清楚，优先解决用户当前问题。'
const DEEP_THINKING_PROMPT =
  '深度思考模式已开启。请控制思考长度，尽快输出正式回答。如果思考与回答出现在同一字段，再用“最终回答：”分隔。'
const WEB_SEARCH_PROMPT =
  '联网搜索已开启。需要实时信息或事实核验时，请基于网络搜索结果回答；如果使用了搜索结果，请在回答末尾用简短列表列出主要来源。'
export const MISSING_FINAL_ANSWER =
  '没有收到模型返回的最终回答。可以展开上面的思考过程查看已返回内容，或重新发送一次。'
const STORAGE_KEY = 'ai-chat:sessions'

const summarizeTitle = (content: string) => {
  const normalized = content.trim().replace(/\s+/g, ' ')
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || '新的对话'
}

const finalAnswerStartPattern =
  /^\s*(?:\d+[.、]\s*)?(?:\*\*)?(?:最终输出生成|最终回答|最终答案|最终回复|正式回答|最终结果|答案如下|回答如下)\s*[：:](?:\*\*)?\s*/

export const stripFinalAnswerMarker = (content: string) => content.replace(finalAnswerStartPattern, '').trimStart()

export const splitReasoningFromAnswer = (content: string) => {
  const normalized = content.trim()
  if (!normalized) return null

  const markerPattern =
    /(?:^|\n)\s*(?:\d+[.、]\s*)?(?:\*\*)?(优化后的回答|优化回答|最终输出生成|最终回答|最终答案|最终回复|正式回答|最终结果|答案如下|回答如下)\s*[：:](?:\*\*)?/g
  const markerMatches = [...normalized.matchAll(markerPattern)]
  const markerMatch = markerMatches.find((match) => match.index !== undefined && match.index > 0)
  if (!markerMatch || markerMatch.index === undefined || markerMatch.index <= 0) return null

  const markerText = markerMatch[0]
  const markerEnd = markerMatch.index + markerText.length
  const reasoning = normalized.slice(0, markerMatch.index).trim()
  let answer = normalized
    .slice(markerEnd)
    .replace(/^\s*[（(][^）)]{0,120}[）)]\s*[。.]?\s*/, '')
    .trim()
  const finalMarkerPattern =
    /(?:^|\n)\s*(?:\d+[.、]\s*)?(?:\*\*)?(最终输出生成|最终回答|最终答案|最终回复|正式回答|最终结果|答案如下|回答如下)\s*[：:](?:\*\*)?/g
  const finalMatches = [...answer.matchAll(finalMarkerPattern)]
  const finalMatch = finalMatches.at(-1)

  if (finalMatch?.index !== undefined) {
    answer = answer
      .slice(finalMatch.index + finalMatch[0].length)
      .replace(/^\s*[（(][^）)]{0,120}[）)]\s*[。.]?\s*/, '')
      .trim()
  }

  if (!reasoning || !answer) return null

  return { answer, reasoning }
}

let responseAbortController: AbortController | null = null

const normalizeStoredMessages = (messages: ChatMessage[]) =>
  messages.filter(
    (message, index) =>
      !(index === 0 && message.role === 'assistant' && message.content === welcomeMessage.content) &&
      !(message.role === 'assistant' && !message.content.trim()),
  )

const readStoredSessions = () => {
  try {
    if (!window.localStorage) return []
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    return (parsed as ChatSession[]).map((session) => ({
      ...session,
      messages: normalizeStoredMessages(session.messages ?? []),
    }))
  } catch {
    return []
  }
}

const writeStoredSessions = (sessions: ChatSession[]) => {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

const getTextFromContent = (content: unknown) => {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''

  return content
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && 'text' in item) return String(item.text)
      if (item && typeof item === 'object' && 'content' in item) return String(item.content)
      return ''
    })
    .join('')
    .trim()
}

const getRawTextFromContent = (content: unknown) => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && 'text' in item) return String(item.text)
      if (item && typeof item === 'object' && 'content' in item) return String(item.content)
      return ''
    })
    .join('')
}

const getAssistantText = (data: unknown) => {
  if (!data || typeof data !== 'object') return ''

  const response = data as Record<string, any>
  const choice = response.choices?.[0] ?? response.data?.choices?.[0]
  const message = choice?.message ?? choice?.delta ?? response.message ?? response.data?.message

  return (
    getTextFromContent(message?.content) ||
    getTextFromContent(choice?.content) ||
    getTextFromContent(choice?.text) ||
    getTextFromContent(response.output_text) ||
    getTextFromContent(response.data?.output_text)
  )
}

const getStreamText = (data: unknown) => {
  if (!data || typeof data !== 'object') return ''

  const response = data as Record<string, any>
  const choice = response.choices?.[0] ?? response.data?.choices?.[0]
  const delta = choice?.delta ?? choice?.message ?? response.delta ?? response.message

  return (
    getRawTextFromContent(delta?.content) ||
    getRawTextFromContent(choice?.content) ||
    getRawTextFromContent(choice?.text) ||
    getRawTextFromContent(response.content)
  )
}

const getStreamReasoningText = (data: unknown) => {
  if (!data || typeof data !== 'object') return ''

  const response = data as Record<string, any>
  const choice = response.choices?.[0] ?? response.data?.choices?.[0]
  const delta = choice?.delta ?? choice?.message ?? response.delta ?? response.message

  return getRawTextFromContent(delta?.reasoning_content)
}

const getApiErrorText = (data: unknown) => {
  if (!data || typeof data !== 'object') return ''

  const response = data as Record<string, any>
  const error = response.error ?? response.data?.error
  return (
    getTextFromContent(error?.message) ||
    getTextFromContent(error?.msg) ||
    getTextFromContent(error?.code) ||
    getTextFromContent(response.message) ||
    getTextFromContent(response.msg)
  )
}

const readErrorResponse = async (response: Response) => {
  const rawText = await response.text()
  if (!rawText) return `请求失败：${response.status}`

  try {
    const data = JSON.parse(rawText)
    return getApiErrorText(data) || rawText
  } catch {
    return rawText
  }
}

const buildApiMessages = (messages: ChatMessage[], systemPrompt = SYSTEM_PROMPT) => {
  const conversation = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .filter((message, index) => !(index === 0 && message.role === 'assistant' && message.content === welcomeMessage.content))

  const selected: Array<{ role: MessageRole; content: string }> = []
  let totalChars = 0

  for (const message of conversation.slice(-CONTEXT_MESSAGE_LIMIT).reverse()) {
    const content = message.content.trim()
    if (!content) continue

    const nextTotal = totalChars + content.length
    if (nextTotal > CONTEXT_CHAR_LIMIT && selected.length > 0) break

    selected.unshift({
      role: message.role,
      content: content.slice(0, Math.max(0, CONTEXT_CHAR_LIMIT - totalChars)),
    })
    totalChars = Math.min(nextTotal, CONTEXT_CHAR_LIMIT)
  }

  return [
    {
      role: 'system',
      content: systemPrompt,
    },
    ...selected,
  ]
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const estimateMaxTokens = (
  apiMessages: Array<{ role: string; content: string }>,
  deepThinking = false,
) => {
  const latestUserChars = [...apiMessages].reverse().find((message) => message.role === 'user')?.content.length ?? 0
  const contextChars = apiMessages.reduce((total, message) => total + message.content.length, 0)

  if (deepThinking) {
    return clamp(
      6144 + Math.ceil(latestUserChars / 2) + Math.ceil(Math.min(contextChars, CONTEXT_CHAR_LIMIT) / 10),
      4096,
      DEEP_THINKING_OUTPUT_TOKEN_LIMIT,
    )
  }

  return clamp(
    2048 + Math.ceil(latestUserChars / 3) + Math.ceil(Math.min(contextChars, CONTEXT_CHAR_LIMIT) / 18),
    1024,
    NORMAL_OUTPUT_TOKEN_LIMIT,
  )
}

const createStreamTypewriter = (
  onToken?: (token: string) => void | Promise<void>,
  signal?: AbortSignal,
) => {
  let queue = ''
  let isRunning = false
  const drainResolvers: Array<() => void> = []

  const resolveDrain = () => {
    if (queue || isRunning) return

    while (drainResolvers.length) {
      drainResolvers.shift()?.()
    }
  }

  const pump = async () => {
    if (signal?.aborted) {
      queue = ''
      isRunning = false
      resolveDrain()
      return
    }

    const characters = Array.from(queue)
    const nextText = characters[0] ?? ''
    queue = characters.slice(1).join('')

    if (nextText) {
      await onToken?.(nextText)
    }

    if (queue) {
      window.requestAnimationFrame(() => void pump())
      return
    }

    isRunning = false
    resolveDrain()
  }

  return {
    enqueue(token: string) {
      if (!token || signal?.aborted) return

      queue += token
      if (isRunning) return

      isRunning = true
      window.requestAnimationFrame(() => void pump())
    },
    drain() {
      if (!queue && !isRunning) return Promise.resolve()

      return new Promise<void>((resolve) => {
        drainResolvers.push(resolve)
      })
    },
  }
}

const emitFullTextWithTypewriter = async (
  text: string,
  onToken?: (token: string) => void | Promise<void>,
  signal?: AbortSignal,
) => {
  if (!text || !onToken) return

  const typewriter = createStreamTypewriter(onToken, signal)
  typewriter.enqueue(text)
  await typewriter.drain()
}

const readStreamResponse = async (
  response: Response,
  onToken?: (token: string) => void | Promise<void>,
  onReasoning?: (token: string) => void | Promise<void>,
  signal?: AbortSignal,
) => {
  if (!response.body) {
    const data = await response.json()
    const text = getAssistantText(data)
    await emitFullTextWithTypewriter(text, onToken, signal)
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const typewriter = createStreamTypewriter(onToken, signal)
  let buffer = ''
  let fullText = ''
  let rawText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    rawText += chunk
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue

      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') {
        await typewriter.drain()
        return fullText
      }

      try {
        const data = JSON.parse(payload)
        const reasoning = getStreamReasoningText(data)
        if (reasoning) {
          await onReasoning?.(reasoning)
        }

        const token = getStreamText(data)
        if (!token) continue

        fullText += token
        typewriter.enqueue(token)
      } catch {
        // Some providers can send keepalive lines; ignore unparsable chunks.
      }
    }
  }

  if (!fullText && rawText.trim()) {
    let fallbackText = ''

    try {
      const data = JSON.parse(rawText)
      fallbackText = getAssistantText(data)
    } catch {
      fallbackText = rawText.trim()
    }

    await emitFullTextWithTypewriter(fallbackText, onToken, signal)
    return fallbackText
  }

  await typewriter.drain()
  return fullText
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    sessions: readStoredSessions() as ChatSession[],
    activeSessionId: '',
    isResponding: false,
    streamingMessageContent: '',
    streamingMessageId: '',
    streamingReasoningContent: '',
    streamingReasoningEndedAt: 0,
    streamingReasoningStartedAt: 0,
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
        messages: [],
        updatedAt: now,
      }

      this.sessions.unshift(session)
      this.activeSessionId = session.id
      writeStoredSessions(this.sessions)
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
      writeStoredSessions(this.sessions)
    },
    deleteSession(sessionId: string) {
      const index = this.sessions.findIndex((session) => session.id === sessionId)
      if (index === -1) return

      this.sessions.splice(index, 1)
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = this.sessions[0]?.id ?? ''
      }
      writeStoredSessions(this.sessions)
    },
    clearActiveSession() {
      const session = this.activeSession
      if (!session) return

      this.stopResponding()

      const now = Date.now()
      session.title = '新的对话'
      session.messages = []
      session.updatedAt = now
      writeStoredSessions(this.sessions)
    },
    async sendMessage(content: string, options: SendOptions = {}) {
      let session = this.activeSession
      const trimmedContent = content.trim()

      if (!trimmedContent || this.isResponding) return
      if (!session) {
        this.createSession()
        session = this.activeSession
      }
      if (!session) return

      const now = Date.now()
      session.messages.push({
        id: createId(),
        role: 'user',
        content: trimmedContent,
        createdAt: now,
      })

      if (session.messages.length === 1) {
        session.title = summarizeTitle(trimmedContent)
      }

      session.updatedAt = now
      this.isResponding = true
      responseAbortController = new AbortController()

      writeStoredSessions(this.sessions)

      let assistantMessage: ChatMessage | null = null
      let contentFallbackBuffer = ''
      let hasProviderReasoning = false
      const ensureAssistantMessage = () => {
        if (!assistantMessage) {
          assistantMessage = {
            id: createId(),
            role: 'assistant',
            content: '',
            createdAt: Date.now(),
          }
          session.messages.push(assistantMessage)
          this.streamingMessageId = assistantMessage.id
          this.streamingMessageContent = ''
          this.streamingReasoningContent = ''
          this.streamingReasoningEndedAt = 0
          this.streamingReasoningStartedAt = 0
        }

        return assistantMessage
      }

      const reply = await this.requestAssistantReply(session.messages, {
        deepThinking: options.deepThinking,
        onReasoning: (token) => {
          hasProviderReasoning = true
          const message = ensureAssistantMessage()
          const now = Date.now()
          if (!this.streamingReasoningStartedAt) {
            this.streamingReasoningStartedAt = now
            message.reasoningStartedAt = now
          }
          this.streamingReasoningContent += token
          message.reasoningContent = this.streamingReasoningContent
          session.updatedAt = now
        },
        onToken: (token) => {
          const message = ensureAssistantMessage()
          if (options.deepThinking && !hasProviderReasoning) {
            const now = Date.now()
            contentFallbackBuffer += token

            if (!this.streamingReasoningStartedAt) {
              this.streamingReasoningStartedAt = message.createdAt || now
              message.reasoningStartedAt = this.streamingReasoningStartedAt
            }

            const fallbackSplit = splitReasoningFromAnswer(contentFallbackBuffer)
            const directAnswer = stripFinalAnswerMarker(contentFallbackBuffer)
            const hasDirectAnswer = directAnswer !== contentFallbackBuffer.trimStart()

            if (hasDirectAnswer) {
              this.streamingReasoningContent = ''
              this.streamingReasoningEndedAt = 0
              this.streamingReasoningStartedAt = 0
              this.streamingMessageContent = directAnswer
              message.reasoningContent = undefined
              message.reasoningEndedAt = undefined
              message.reasoningStartedAt = undefined
              message.content = directAnswer
            } else if (fallbackSplit) {
              if (!this.streamingReasoningEndedAt) {
                this.streamingReasoningEndedAt = now
                message.reasoningEndedAt = now
              }
              this.streamingReasoningContent = fallbackSplit.reasoning
              this.streamingMessageContent = fallbackSplit.answer
              message.reasoningContent = fallbackSplit.reasoning
              message.content = fallbackSplit.answer
            } else {
              this.streamingReasoningContent = contentFallbackBuffer
              this.streamingMessageContent = ''
              message.reasoningContent = contentFallbackBuffer
              message.content = ''
            }

            session.updatedAt = now
            return
          }

          if (this.streamingReasoningContent && !this.streamingReasoningEndedAt) {
            this.streamingReasoningEndedAt = Date.now()
            message.reasoningEndedAt = this.streamingReasoningEndedAt
          }
          this.streamingMessageContent += token
          session.updatedAt = Date.now()
        },
        signal: responseAbortController.signal,
      })
      responseAbortController = null
      if (!this.isResponding) return

      if (assistantMessage) {
        if (this.streamingReasoningContent && !this.streamingReasoningEndedAt) {
          this.streamingReasoningEndedAt = Date.now()
        }
        let finalContent = this.streamingMessageContent
        let finalReasoning = this.streamingReasoningContent
        let reasoningStartedAt = this.streamingReasoningStartedAt
        let reasoningEndedAt = this.streamingReasoningEndedAt
        const fallbackSource = contentFallbackBuffer || finalContent
        const fallbackSplit =
          options.deepThinking && !hasProviderReasoning ? splitReasoningFromAnswer(fallbackSource) : null
        const directAnswer =
          options.deepThinking && !hasProviderReasoning && contentFallbackBuffer ? stripFinalAnswerMarker(contentFallbackBuffer) : ''
        const hasDirectAnswer = Boolean(directAnswer && directAnswer !== contentFallbackBuffer.trimStart())

        if (hasDirectAnswer) {
          finalContent = directAnswer
          finalReasoning = ''
          reasoningStartedAt = 0
          reasoningEndedAt = 0
        } else if (fallbackSplit) {
          finalContent = fallbackSplit.answer
          finalReasoning = fallbackSplit.reasoning
          reasoningStartedAt = assistantMessage.createdAt
          reasoningEndedAt = Date.now()
        } else if (options.deepThinking && !hasProviderReasoning && contentFallbackBuffer) {
          finalContent = contentFallbackBuffer
          finalReasoning = ''
          reasoningStartedAt = 0
          reasoningEndedAt = 0
        }

        const reasoningAnswerSplit = finalReasoning.trim() && !finalContent.trim()
          ? splitReasoningFromAnswer(finalReasoning)
          : null

        if (reasoningAnswerSplit) {
          finalContent = reasoningAnswerSplit.answer
          finalReasoning = reasoningAnswerSplit.reasoning
          reasoningStartedAt = reasoningStartedAt || assistantMessage.createdAt
          reasoningEndedAt = reasoningEndedAt || Date.now()
        } else if (finalReasoning.trim() && !finalContent.trim()) {
          finalContent = MISSING_FINAL_ANSWER
        }

        assistantMessage.content = finalContent
        assistantMessage.reasoningContent = finalReasoning || undefined
        assistantMessage.reasoningStartedAt = reasoningStartedAt || undefined
        assistantMessage.reasoningEndedAt = reasoningEndedAt || undefined
      } else if (reply) {
        const fallbackSplit = options.deepThinking ? splitReasoningFromAnswer(reply) : null
        assistantMessage = {
          id: createId(),
          role: 'assistant',
          content: fallbackSplit?.answer ?? reply,
          reasoningContent: fallbackSplit?.reasoning,
          reasoningEndedAt: fallbackSplit ? Date.now() : undefined,
          reasoningStartedAt: fallbackSplit ? Date.now() : undefined,
          createdAt: Date.now(),
        }
        session.messages.push(assistantMessage)
      }
      session.updatedAt = Date.now()
      this.isResponding = false
      this.streamingMessageContent = ''
      this.streamingMessageId = ''
      this.streamingReasoningContent = ''
      this.streamingReasoningEndedAt = 0
      this.streamingReasoningStartedAt = 0
      writeStoredSessions(this.sessions)
    },
    stopResponding() {
      responseAbortController?.abort()
      responseAbortController = null

      this.isResponding = false
      this.streamingMessageContent = ''
      this.streamingMessageId = ''
      this.streamingReasoningContent = ''
      this.streamingReasoningEndedAt = 0
      this.streamingReasoningStartedAt = 0
    },
    async requestAssistantReply(messages: ChatMessage[], options: RequestAssistantOptions = {}) {
      if (!BIGMODEL_API_KEY) {
        const message = '还没有配置 BigModel API Key。请在 src/stores/chat.ts 顶部的 BIGMODEL_API_KEY 里填入你的 Key。'
        await emitFullTextWithTypewriter(message, options.onToken, options.signal)
        return message
      }

      const systemPrompt = [
        options.systemPrompt ?? SYSTEM_PROMPT,
        options.deepThinking ? DEEP_THINKING_PROMPT : '',
        options.webSearch ? WEB_SEARCH_PROMPT : '',
      ]
        .filter(Boolean)
        .join('\n')
      const apiMessages = buildApiMessages(messages, systemPrompt)
      const maxTokens = estimateMaxTokens(apiMessages, options.deepThinking)
      const tools = options.webSearch
        ? [
            {
              type: 'web_search',
              web_search: {
                enable: true,
                search_engine: 'search_std',
                search_result: true,
                search_prompt:
                  '请用简洁的语言总结网络搜索结果 {search_result} 中和用户问题最相关的信息，优先使用最新、可信的来源。今天的日期是 ' +
                  new Date().toLocaleDateString('zh-CN') +
                  '。',
              },
            },
          ]
        : undefined

      try {
        const response = await fetch(BIGMODEL_API_URL, {
          method: 'POST',
          headers: {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${BIGMODEL_API_KEY}`,
          },
          body: JSON.stringify({
            model: BIGMODEL_MODEL,
            messages: apiMessages,
            thinking: {
              type: options.deepThinking ? 'enabled' : 'disabled',
              clear_thinking: true,
            },
            ...(tools ? { tools } : {}),
            max_tokens: maxTokens,
            stream: true,
            temperature: 1,
          }),
          signal: options.signal,
        })

        if (!response.ok) {
          throw new Error(await readErrorResponse(response))
        }

        const reply = await readStreamResponse(response, options.onToken, options.onReasoning, options.signal)
        if (reply) return reply

        console.warn('GLM response without readable content')
        return '接口返回为空。已在浏览器控制台打印原始返回，请看 Console 里的 “GLM response without readable content”。'
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return ''
        console.error(error)
        const message = error instanceof Error ? error.message : String(error)
        await emitFullTextWithTypewriter(message, options.onToken, options.signal)
        return message
      }
    },
  },
})
