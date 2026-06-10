import { defineStore } from 'pinia'

export type MessageRole = 'user' | 'assistant'

// 搜索来源会同时用于正文引用、悬浮预览和回答底部卡片。
export interface WebSearchSource {
  icon?: string
  publishedAt?: string
  refer?: string
  siteName?: string
  snippet?: string
  title: string
  url: string
}

export interface ChatMessage {
  // branchOf 指向原始用户消息；没有该字段的消息属于主版本。
  branchLabel?: string
  branchOf?: string
  id: string
  role: MessageRole
  content: string
  // error 和 truncated 分别对应“重试”和“继续生成”两种恢复方式。
  error?: string
  favorited?: boolean
  reasoningContent?: string
  // 思考起止时间用于生成期间计时和历史消息耗时展示。
  reasoningEndedAt?: number
  reasoningStartedAt?: number
  sources?: WebSearchSource[]
  truncated?: boolean
  createdAt: number
}

export interface ChatSession {
  // 每个原始用户消息只保存一个当前可见分支 id。
  activeBranchIds?: Record<string, string>
  // 归档和删除采用时间戳软状态，便于恢复并按时间排序。
  archivedAt?: number
  branchDepth?: number
  // 新聊天分支保留父会话信息，用于列表标识和后续扩展。
  branchParentSessionId?: string
  branchParentTitle?: string
  branchRootSessionId?: string
  branchSourceMessageId?: string
  contextClearedAt?: number
  deletedAt?: number
  id: string
  title: string
  messages: ChatMessage[]
  pinned?: boolean
  updatedAt: number
}

interface SendOptions {
  // UI 层发送参数；未提供的值由请求层使用默认策略。
  agentMode?: boolean
  branchLabel?: string
  branchOf?: string
  contextClearedAt?: number
  deepThinking?: boolean
  maxTokens?: number
  systemPrompt?: string
  temperature?: number
  webSearch?: boolean
}

interface RequestAssistantOptions extends SendOptions {
  // 流式协议通过回调上报，上层决定写入普通会话还是项目会话。
  onError?: (message: string) => void | Promise<void>
  onFinish?: (truncated: boolean) => void | Promise<void>
  onReasoning?: (token: string) => void | Promise<void>
  onSources?: (sources: WebSearchSource[]) => void | Promise<void>
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

// API、上下文和输出长度限制集中定义，避免散落在请求流程中。
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
  '联网搜索已开启。需要实时信息或事实核验时，请基于网络搜索结果回答，并在对应事实后保留搜索结果的 refer 标识（例如【ref_1】），不要自行编造引用。'
const AGENT_MODE_PROMPT =
  'Agent 模式已开启。你可以按需调用可用工具获取确定结果。工具返回后，请基于工具结果给出自然、简洁的最终回答，不要暴露内部工具 JSON。'
export const MISSING_FINAL_ANSWER =
  '没有收到模型返回的最终回答。可以展开上面的思考过程查看已返回内容，或重新发送一次。'
const STORAGE_KEY = 'ai-chat:sessions'
const TOOL_STATE_KEY = 'ai-chat:tool-state'

type ApiMessage = {
  // tool 字段仅在 Agent 第二轮请求中出现。
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: AgentToolCall[]
}

type AgentToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type StreamReply = {
  // 无论响应是否真正流式，最终都规范化为同一结果结构。
  finishReason: string
  sources: WebSearchSource[]
  text: string
  toolCalls: AgentToolCall[]
}

const summarizeTitle = (content: string) => {
  // 去掉常见指令前缀，让自动标题更接近实际主题。
  const normalized = content
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(?:请|麻烦|帮我|请帮我|能不能|可以|可以帮我)?\s*(?:详细)?(?:解释|介绍|分析|说明|说说|聊聊|总结|写|生成|润色|翻译|优化)(?:一下|下|一下子)?\s*[：:，,。.]?\s*/i, '')
    .replace(/^(?:关于|有关|对于)\s*/, '')
    .replace(/^(?:什么是|什么叫|如何|怎么|怎样)\s*/, '')
    .trim()
  const fallback = content.trim().replace(/\s+/g, ' ')
  const title = normalized || fallback

  return title.length > 18 ? `${title.slice(0, 18)}...` : title || '新的对话'
}

const finalAnswerStartPattern =
  /^\s*(?:\d+[.、]\s*)?(?:\*\*)?(?:最终输出生成|最终回答|最终答案|最终回复|正式回答|最终结果|答案如下|回答如下)\s*[：:](?:\*\*)?\s*/

export const stripFinalAnswerMarker = (content: string) => content.replace(finalAnswerStartPattern, '').trimStart()

// 兼容把“思考过程 + 最终回答”混在同一文本字段中的模型响应。
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
  // 兼容旧数据，并清除崩溃或刷新时残留的无内容助手消息。
  messages.filter(
    (message, index) =>
      !(index === 0 && message.role === 'assistant' && message.content === welcomeMessage.content) &&
      !(message.role === 'assistant' && !message.content.trim() && !message.error),
  )

const readStoredSessions = () => {
  // localStorage 数据视为不可信输入，解析失败时回退为空列表。
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

const readStoredWebSearchEnabled = () => {
  try {
    if (typeof window === 'undefined') return false
    const stored = window.localStorage?.getItem(TOOL_STATE_KEY)
    if (!stored) return false

    return Boolean(JSON.parse(stored)?.webSearch)
  } catch {
    return false
  }
}

const readStoredAgentModeEnabled = () => {
  try {
    if (typeof window === 'undefined') return false
    const stored = window.localStorage?.getItem(TOOL_STATE_KEY)
    if (!stored) return false

    return Boolean(JSON.parse(stored)?.agentMode)
  } catch {
    return false
  }
}

const getTextFromContent = (content: unknown) => {
  // 非流式文本用于最终结果，因此会 trim 首尾空白。
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
  // 流式增量必须保留原始空格和换行，不能使用 trim。
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
  // 同时兼容 OpenAI 风格及部分代理层包装后的非流式字段。
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
  // 兼容 delta、message 和代理层直接 content 三种增量结构。
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
  // 当前供应商通过 reasoning_content 返回独立思考增量。
  if (!data || typeof data !== 'object') return ''

  const response = data as Record<string, any>
  const choice = response.choices?.[0] ?? response.data?.choices?.[0]
  const delta = choice?.delta ?? choice?.message ?? response.delta ?? response.message

  return getRawTextFromContent(delta?.reasoning_content)
}

const normalizeWebSearchSource = (source: any, index: number): WebSearchSource | null => {
  // 无有效 HTTP URL 的候选项不能生成可点击来源卡片。
  const url = getRawTextFromContent(source?.link ?? source?.url).trim()
  if (!/^https?:\/\//i.test(url)) return null

  const title =
    getRawTextFromContent(source?.title) ||
    getRawTextFromContent(source?.name) ||
    getRawTextFromContent(source?.media) ||
    url

  return {
    icon: getRawTextFromContent(source?.icon) || undefined,
    publishedAt:
      getRawTextFromContent(source?.publish_date ?? source?.published_at ?? source?.date) || undefined,
    refer:
      (typeof source?.refer === 'string' || typeof source?.refer === 'number'
        ? String(source.refer)
        : '') || `ref_${index + 1}`,
    siteName:
      getRawTextFromContent(source?.media ?? source?.site_name ?? source?.siteName) || undefined,
    snippet:
      getRawTextFromContent(source?.content ?? source?.snippet ?? source?.description) || undefined,
    title,
    url,
  }
}

const getWebSearchSourcesFromData = (data: unknown) => {
  if (!data || typeof data !== 'object') return []

  const candidates: unknown[] = []
  const visited = new WeakSet<object>()

  // 不同兼容接口会把来源塞在响应、工具参数或 JSON 字符串中，因此递归收集。
  const collect = (value: unknown, key = '', depth = 0) => {
    if (depth > 12 || value === null || value === undefined) return

    if (typeof value === 'string') {
      const normalized = value.trim()
      if (
        /search|result|argument|output|content/i.test(key) &&
        (normalized.startsWith('{') || normalized.startsWith('['))
      ) {
        try {
          collect(JSON.parse(normalized), key, depth + 1)
        } catch {
          // Tool fields can also contain ordinary text.
        }
      }
      return
    }

    if (Array.isArray(value)) {
      value.forEach((item) => collect(item, key, depth + 1))
      return
    }

    if (typeof value !== 'object' || visited.has(value)) return
    visited.add(value)

    const record = value as Record<string, unknown>
    const rawUrl = record.link ?? record.url ?? record.href
    const hasUrl = typeof rawUrl === 'string' && /^https?:\/\//i.test(rawUrl.trim())
    const looksLikeSource =
      hasUrl &&
      (
        /search|result|web|source|reference|citation/i.test(key) ||
        'refer' in record ||
        'media' in record ||
        'publish_date' in record ||
        'snippet' in record ||
        'title' in record
      )

    if (looksLikeSource) {
      candidates.push(record)
    }

    Object.entries(record).forEach(([childKey, childValue]) => {
      collect(childValue, childKey, depth + 1)
    })
  }

  collect(data)

  const sources = candidates
    .map(normalizeWebSearchSource)
    .filter((source): source is WebSearchSource => Boolean(source))

  return sources.filter(
    (source, index) => sources.findIndex((item) => item.url === source.url) === index,
  )
}

const appendWebSearchSources = (sources: WebSearchSource[], incoming: WebSearchSource[]) => {
  // URL 作为稳定去重键，后到字段可补全先到的简略来源。
  for (const source of incoming) {
    const existingIndex = sources.findIndex((item) => item.url === source.url)
    if (existingIndex >= 0) {
      sources[existingIndex] = { ...sources[existingIndex], ...source }
    } else {
      sources.push(source)
    }
  }
}

const normalizeToolCall = (call: any, fallbackIndex = 0): AgentToolCall => ({
  id: getRawTextFromContent(call?.id) || `tool-call-${fallbackIndex}`,
  type: 'function',
  function: {
    name: getRawTextFromContent(call?.function?.name),
    arguments: getRawTextFromContent(call?.function?.arguments),
  },
})

const getToolCallsFromData = (data: unknown) => {
  // 返回尚未拼接的调用片段，appendToolCallChunks 负责按 index 合并。
  if (!data || typeof data !== 'object') return []

  const response = data as Record<string, any>
  const choice = response.choices?.[0] ?? response.data?.choices?.[0]
  const delta = choice?.delta ?? choice?.message ?? response.delta ?? response.message
  const toolCalls = delta?.tool_calls ?? choice?.tool_calls ?? response.tool_calls ?? response.data?.tool_calls

  if (!Array.isArray(toolCalls)) return []

  return toolCalls
    .map((call, index) => ({
      index: typeof call?.index === 'number' ? call.index : index,
      id: getRawTextFromContent(call?.id),
      type: getRawTextFromContent(call?.type),
      name: getRawTextFromContent(call?.function?.name),
      arguments: getRawTextFromContent(call?.function?.arguments),
    }))
    .filter((call) => call.type === 'function' || Boolean(call.name || call.arguments))
}

const getFinishReasonFromData = (data: unknown) => {
  // finish reason 用于判断是否因 token 上限中断。
  if (!data || typeof data !== 'object') return ''

  const response = data as Record<string, any>
  const choice = response.choices?.[0] ?? response.data?.choices?.[0]
  return getRawTextFromContent(
    choice?.finish_reason ??
      choice?.finishReason ??
      response.finish_reason ??
      response.finishReason,
  )
}

const appendToolCallChunks = (
  toolCalls: AgentToolCall[],
  chunks: Array<{ index: number; id: string; type: string; name: string; arguments: string }>,
) => {
  // 流式 tool_calls 会把名称和参数拆成多段，按 index 重新拼成完整调用。
  for (const chunk of chunks) {
    const current =
      toolCalls[chunk.index] ??
      ({
        id: chunk.id || `tool-call-${chunk.index}`,
        type: 'function',
        function: {
          name: '',
          arguments: '',
        },
      } satisfies AgentToolCall)

    current.id = chunk.id || current.id
    current.type = 'function'
    current.function.name = chunk.name || current.function.name
    current.function.arguments += chunk.arguments
    toolCalls[chunk.index] = current
  }
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

const buildWebSearchTools = (enabled: boolean) => [
  // 即使关闭也保留平台要求的工具结构，由 enable 控制是否执行搜索。
  {
    type: 'web_search',
    web_search: {
      enable: enabled,
      search_engine: 'search_std',
      search_result: true,
      count: 5,
      content_size: 'medium',
      search_recency_filter: 'noLimit',
      search_prompt:
        '请用简洁的语言总结网络搜索结果 {search_result} 中和用户问题最相关的信息，优先使用最新、可信的来源。今天的日期是 ' +
        new Date().toLocaleDateString('zh-CN') +
        '。',
    },
  },
]

const buildAgentFunctionTools = (enabled: boolean) =>
  enabled
    ? [
        {
          type: 'function',
          function: {
            name: 'get_current_time',
            description: '获取用户本地当前日期、时间和时区。',
            parameters: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'calculate_expression',
            description: '计算一个只包含数字、括号和四则运算符的表达式。',
            parameters: {
              type: 'object',
              properties: {
                expression: {
                  type: 'string',
                  description: '要计算的表达式，例如 "12 * (3 + 4) / 2"。',
                },
              },
              required: ['expression'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'summarize_conversation',
            description: '总结当前对话中最近几条消息，适合用户要求回顾上下文时使用。',
            parameters: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: '需要总结的最近消息数量，默认 6，最大 12。',
                },
              },
              required: [],
            },
          },
        },
      ]
    : []

const buildRequestTools = (webSearchEnabled: boolean, agentModeEnabled: boolean) => [
  ...buildWebSearchTools(webSearchEnabled),
  ...buildAgentFunctionTools(agentModeEnabled),
]

const parseToolArguments = (rawArguments: string) => {
  // 模型参数格式错误时返回空对象，让具体工具给出可读错误。
  try {
    return rawArguments ? JSON.parse(rawArguments) : {}
  } catch {
    return {}
  }
}

const calculateExpression = (expression: unknown) => {
  const normalized = String(expression ?? '').trim()
  if (!normalized) throw new Error('缺少 expression 参数。')
  if (normalized.length > 120) throw new Error('表达式太长。')
  // Function 只接收经过白名单限制的算术字符，禁止标识符和属性访问。
  if (!/^[\d+\-*/().%\s]+$/.test(normalized)) {
    throw new Error('只支持数字、括号和 + - * / % 运算符。')
  }

  const value = Function(`"use strict"; return (${normalized})`)()
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('表达式结果不是有效数字。')
  }

  return value
}

const executeAgentTool = (toolCall: AgentToolCall, messages: ChatMessage[]) => {
  // 当前 Agent 工具全部在浏览器本地执行，不依赖额外后端。
  const args = parseToolArguments(toolCall.function.arguments)

  try {
    if (toolCall.function.name === 'get_current_time') {
      const now = new Date()
      return JSON.stringify({
        ok: true,
        time: now.toLocaleString('zh-CN'),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: now.toISOString(),
      })
    }

    if (toolCall.function.name === 'calculate_expression') {
      return JSON.stringify({
        ok: true,
        expression: args.expression,
        result: calculateExpression(args.expression),
      })
    }

    if (toolCall.function.name === 'summarize_conversation') {
      const limit = clamp(Number(args.limit) || 6, 1, 12)
      const recentMessages = messages.slice(-limit).map((message) => ({
        role: message.role,
        content: message.content.slice(0, 500),
      }))

      return JSON.stringify({
        ok: true,
        messages: recentMessages,
      })
    }

    return JSON.stringify({
      ok: false,
      error: `未知工具：${toolCall.function.name}`,
    })
  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

const readErrorResponse = async (response: Response) => {
  // 优先提取结构化 API 错误，非 JSON 响应保留原始文本。
  const rawText = await response.text()
  if (!rawText) return `请求失败：${response.status}`

  try {
    const data = JSON.parse(rawText)
    return getApiErrorText(data) || rawText
  } catch {
    return rawText
  }
}

const buildApiMessages = (messages: ChatMessage[], systemPrompt = SYSTEM_PROMPT, contextClearedAt = 0): ApiMessage[] => {
  // 页面可以保留全部历史，但发给模型的上下文受清空时间和长度双重限制。
  const conversation = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .filter((message) => !contextClearedAt || message.createdAt >= contextClearedAt)
    .filter((message, index) => !(index === 0 && message.role === 'assistant' && message.content === welcomeMessage.content))

  const selected: ApiMessage[] = []
  let totalChars = 0

  // 从最新消息向前截取，优先保证当前问题的上下文不被旧历史挤掉。
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
  apiMessages: ApiMessage[],
  deepThinking = false,
) => {
  // 根据当前问题和上下文规模给出上限，设置页的显式值会覆盖此估算。
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
  // 网络分片大小不稳定；独立队列把展示节奏统一成逐字符更新。
  let queue = ''
  let isRunning = false
  const drainResolvers: Array<() => void> = []

  const resolveDrain = () => {
    // 只有队列和当前帧都结束后，流读取方才能安全进入收尾阶段。
    if (queue || isRunning) return

    while (drainResolvers.length) {
      drainResolvers.shift()?.()
    }
  }

  const pump = async () => {
    // Abort 后立即清空待展示字符，避免停止按钮按下后继续“吐字”。
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
      // 新分片只追加队列，已有动画循环时不重复启动 requestAnimationFrame。
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
  // 非流式接口也复用相同展示节奏，避免 UI 行为因供应商而不同。
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
    // 某些代理不返回 ReadableStream，退化为一次性 JSON 响应。
    const data = await response.json()
    const text = getAssistantText(data)
    await emitFullTextWithTypewriter(text, onToken, signal)
    return {
      finishReason: getFinishReasonFromData(data),
      sources: getWebSearchSourcesFromData(data),
      text,
      toolCalls: getToolCallsFromData(data).map((call, index) =>
        normalizeToolCall(
          {
            id: call.id,
            type: call.type,
            function: {
              name: call.name,
              arguments: call.arguments,
            },
          },
          index,
        ),
      ),
    } satisfies StreamReply
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const typewriter = createStreamTypewriter(onToken, signal)
  let buffer = ''
  let fullText = ''
  let rawText = ''
  let finishReason = ''
  const toolCalls: AgentToolCall[] = []
  const sources: WebSearchSource[] = []

  // 按 SSE 行解析，同时累积正文、思考、工具调用和联网来源。
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
        // 工具参数中也可能包含搜索结果，结束前再做一次来源提取。
        appendWebSearchSources(
          sources,
          getWebSearchSourcesFromData({
            toolCalls: toolCalls.map((call) => ({
              arguments: call.function.arguments,
            })),
          }),
        )
        await typewriter.drain()
        return { finishReason, sources, text: fullText, toolCalls } satisfies StreamReply
      }

      try {
        const data = JSON.parse(payload)
        finishReason = getFinishReasonFromData(data) || finishReason
        appendToolCallChunks(toolCalls, getToolCallsFromData(data))
        appendWebSearchSources(sources, getWebSearchSourcesFromData(data))

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
    // 服务端声明流式却返回整段 JSON/文本时，尝试进行最终兜底解析。
    let fallbackText = ''

    try {
      const data = JSON.parse(rawText)
      fallbackText = getAssistantText(data)
      appendWebSearchSources(sources, getWebSearchSourcesFromData(data))
    } catch {
      fallbackText = rawText.trim()
    }

    await emitFullTextWithTypewriter(fallbackText, onToken, signal)
    return { finishReason, sources, text: fallbackText, toolCalls } satisfies StreamReply
  }

  appendWebSearchSources(
    sources,
    getWebSearchSourcesFromData({
      toolCalls: toolCalls.map((call) => ({
        arguments: call.function.arguments,
      })),
    }),
  )
  await typewriter.drain()
  return { finishReason, sources, text: fullText, toolCalls } satisfies StreamReply
}

export const useChatStore = defineStore('chat', {
  // Store 只管理普通会话；项目会话由 useChatApp 按项目名称分组维护。
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
    // 当前会话失效时回退到第一个可见会话，避免归档或删除后展示空引用。
    activeSession: (state) =>
      state.sessions.find(
        (session) =>
          session.id === state.activeSessionId &&
          !session.archivedAt &&
          !session.deletedAt,
      ) ??
      state.sessions.find((session) => !session.archivedAt && !session.deletedAt),
  },
  actions: {
    createSession() {
      // 新会话插到列表首位，并立即成为普通模式的活动会话。
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
      // 切换本身不写 localStorage，活动位置由应用级状态决定。
      this.activeSessionId = sessionId
    },
    renameSession(sessionId: string, title: string) {
      // 空标题不覆盖原值。
      const session = this.sessions.find((item) => item.id === sessionId)
      const normalized = title.trim()
      if (!session || !normalized) return

      session.title = normalized
      session.updatedAt = Date.now()
      writeStoredSessions(this.sessions)
    },
    deleteSession(sessionId: string) {
      // 该操作是彻底删除；软删除使用 trashSession。
      const index = this.sessions.findIndex((session) => session.id === sessionId)
      if (index === -1) return

      this.sessions.splice(index, 1)
      if (this.activeSessionId === sessionId) {
        // 删除活动会话后允许回退到列表中的下一条。
        this.activeSessionId = this.sessions[0]?.id ?? ''
      }
      writeStoredSessions(this.sessions)
    },
    archiveSession(sessionId: string) {
      // 归档和回收站状态互斥。
      const session = this.sessions.find((item) => item.id === sessionId)
      if (!session) return
      session.archivedAt = Date.now()
      session.deletedAt = undefined
      session.updatedAt = Date.now()
      if (this.activeSessionId === sessionId) {
        // 活动会话被隐藏时切换到下一条可见会话。
        this.activeSessionId =
          this.sessions.find((item) => !item.archivedAt && !item.deletedAt && item.id !== sessionId)?.id ?? ''
      }
      writeStoredSessions(this.sessions)
    },
    trashSession(sessionId: string) {
      // 回收站保留完整消息数据，直到用户选择彻底删除。
      const session = this.sessions.find((item) => item.id === sessionId)
      if (!session) return
      session.deletedAt = Date.now()
      session.archivedAt = undefined
      session.updatedAt = Date.now()
      if (this.activeSessionId === sessionId) {
        this.activeSessionId =
          this.sessions.find((item) => !item.archivedAt && !item.deletedAt && item.id !== sessionId)?.id ?? ''
      }
      writeStoredSessions(this.sessions)
    },
    restoreSession(sessionId: string) {
      // 不关心来源是归档还是回收站，恢复时统一清除两个标记。
      const session = this.sessions.find((item) => item.id === sessionId)
      if (!session) return
      session.archivedAt = undefined
      session.deletedAt = undefined
      session.updatedAt = Date.now()
      writeStoredSessions(this.sessions)
    },
    toggleSessionPinned(sessionId: string) {
      // 排序由 useChatApp 的 sortSessions 统一处理。
      const session = this.sessions.find((item) => item.id === sessionId)
      if (!session) return

      session.pinned = !session.pinned
      writeStoredSessions(this.sessions)
    },
    clearSessionContext(sessionId: string) {
      // 只写时间边界，历史消息仍保留在 session.messages。
      const session = this.sessions.find((item) => item.id === sessionId)
      if (!session) return

      session.contextClearedAt = Date.now()
      session.updatedAt = Date.now()
      writeStoredSessions(this.sessions)
    },
    clearActiveSession() {
      // 与“清空上下文”不同，该操作真正删除当前会话全部消息。
      const session = this.activeSession
      if (!session) return

      this.stopResponding()

      const now = Date.now()
      // 清空后复用当前 session id，避免侧边栏产生额外空会话。
      session.title = '新的对话'
      session.messages = []
      session.updatedAt = now
      writeStoredSessions(this.sessions)
    },
    async sendMessage(content: string, options: SendOptions = {}) {
      // 普通会话发送流程：写入问题、消费流、整理最终消息、保存会话。
      let session = this.activeSession
      const trimmedContent = content.trim()

      if (!trimmedContent || this.isResponding) return
      if (!session) {
        this.createSession()
        session = this.activeSession
      }
      if (!session) return

      const now = Date.now()
      const branchSourceIndex = options.branchOf
        ? session.messages.findIndex((message) => message.id === options.branchOf)
        : -1
      const userMessage: ChatMessage = {
        branchLabel: options.branchLabel,
        branchOf: options.branchOf,
        id: createId(),
        role: 'user',
        content: trimmedContent,
        createdAt: now,
      }
      session.messages.push(userMessage)
      if (options.branchOf) {
        // 发送新版本后立即把它设为该轮当前分支。
        session.activeBranchIds = {
          ...(session.activeBranchIds ?? {}),
          [options.branchOf]: userMessage.id,
        }
      }

      if (session.messages.length === 1) {
        // 标题只在首条消息时自动生成，之后尊重用户重命名。
        session.title = summarizeTitle(trimmedContent)
      }

      session.updatedAt = now
      this.isResponding = true
      // 每次请求使用独立控制器，停止按钮只取消当前请求。
      responseAbortController = new AbortController()

      writeStoredSessions(this.sessions)

      let assistantMessage: ChatMessage | null = null
      // 以下变量记录本次请求的临时结果，结束后一次性写回消息。
      let contentFallbackBuffer = ''
      let hasProviderReasoning = false
      let responseError = ''
      let responseSources: WebSearchSource[] = []
      let responseTruncated = false
      const ensureAssistantMessage = () => {
        // 收到首个正文、思考或错误时才创建，避免等待阶段出现空白 AI 消息。
        if (!assistantMessage) {
          assistantMessage = {
            branchLabel: options.branchLabel,
            branchOf: options.branchOf,
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

      const contextMessages =
        // 编辑生成分支时不把被替换的旧分支继续发送给模型。
        branchSourceIndex >= 0 ? [...session.messages.slice(0, branchSourceIndex), userMessage] : session.messages

      const reply = await this.requestAssistantReply(contextMessages, {
        agentMode: options.agentMode,
        contextClearedAt: session.contextClearedAt,
        deepThinking: options.deepThinking,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        webSearch: options.webSearch,
        onError: (message) => {
          // 错误消息也创建助手记录，刷新页面后仍可看到并重试。
          responseError = message
          ensureAssistantMessage().error = message
        },
        onFinish: (truncated) => {
          // 是否截断由协议 finish_reason 决定，不通过文本猜测。
          responseTruncated = truncated
        },
        onSources: (sources) => {
          // 保留本次来源用于最终收尾，同时尽早更新正在显示的消息。
          responseSources = sources
          const message = assistantMessage as ChatMessage | null
          if (message) message.sources = sources
        },
        onReasoning: (token) => {
          // 专用 reasoning token 直接进入思考区。
          hasProviderReasoning = true
          const message = ensureAssistantMessage()
          const now = Date.now()
          if (!this.streamingReasoningStartedAt) {
            // 首个思考 token 决定计时起点。
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
            // 没有独立思考字段时，暂存 content 并按“最终回答”标记拆分。
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
              // content 从最终回答开始时，清除之前推测出的思考状态。
              this.streamingReasoningContent = ''
              this.streamingReasoningEndedAt = 0
              this.streamingReasoningStartedAt = 0
              this.streamingMessageContent = directAnswer
              message.reasoningContent = undefined
              message.reasoningEndedAt = undefined
              message.reasoningStartedAt = undefined
              message.content = directAnswer
            } else if (fallbackSplit) {
              // 识别到分隔标记后，开始同步显示正式答案。
              if (!this.streamingReasoningEndedAt) {
                this.streamingReasoningEndedAt = now
                message.reasoningEndedAt = now
              }
              this.streamingReasoningContent = fallbackSplit.reasoning
              this.streamingMessageContent = fallbackSplit.answer
              message.reasoningContent = fallbackSplit.reasoning
              message.content = fallbackSplit.answer
            } else {
              // 分隔标记出现前，累计文本暂时显示在思考区域。
              this.streamingReasoningContent = contentFallbackBuffer
              this.streamingMessageContent = ''
              message.reasoningContent = contentFallbackBuffer
              message.content = ''
            }

            session.updatedAt = now
            return
          }

          if (this.streamingReasoningContent && !this.streamingReasoningEndedAt) {
            // 专用 reasoning 结束后收到正文，记录结束时间。
            this.streamingReasoningEndedAt = Date.now()
            message.reasoningEndedAt = this.streamingReasoningEndedAt
          }
          this.streamingMessageContent += token
          session.updatedAt = Date.now()
        },
        signal: responseAbortController.signal,
        systemPrompt: options.systemPrompt,
      })
      responseAbortController = null
      // stopResponding 已将 isResponding 设为 false 时，不再执行正常收尾。
      if (!this.isResponding) return

      const completedAssistantMessage = assistantMessage as ChatMessage | null
      if (completedAssistantMessage) {
        // 流式阶段偏向即时展示，结束阶段再统一修正最终数据结构。
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
          reasoningStartedAt = completedAssistantMessage.createdAt
          reasoningEndedAt = Date.now()
        } else if (options.deepThinking && !hasProviderReasoning && contentFallbackBuffer) {
          // 无法拆分时优先保证用户能看到返回文本。
          finalContent = contentFallbackBuffer
          finalReasoning = ''
          reasoningStartedAt = 0
          reasoningEndedAt = 0
        }

        const reasoningAnswerSplit = finalReasoning.trim() && !finalContent.trim()
          ? splitReasoningFromAnswer(finalReasoning)
          : null

        if (reasoningAnswerSplit) {
          // 对只写入 reasoning 的兼容响应尝试挽救其中的最终答案。
          finalContent = reasoningAnswerSplit.answer
          finalReasoning = reasoningAnswerSplit.reasoning
          reasoningStartedAt = reasoningStartedAt || completedAssistantMessage.createdAt
          reasoningEndedAt = reasoningEndedAt || Date.now()
        } else if (finalReasoning.trim() && !finalContent.trim()) {
          finalContent = MISSING_FINAL_ANSWER
        }

        completedAssistantMessage.content = finalContent
        completedAssistantMessage.error = responseError || undefined
        completedAssistantMessage.reasoningContent = finalReasoning || undefined
        completedAssistantMessage.reasoningStartedAt = reasoningStartedAt || undefined
        completedAssistantMessage.reasoningEndedAt = reasoningEndedAt || undefined
        completedAssistantMessage.sources = responseSources.length ? responseSources : undefined
        completedAssistantMessage.truncated = responseTruncated || undefined
      } else if (reply) {
        // 非流式响应可能没有调用 onToken，此时从 reply 创建完整消息。
        const fallbackSplit = options.deepThinking ? splitReasoningFromAnswer(reply) : null
        assistantMessage = {
          branchLabel: options.branchLabel,
          branchOf: options.branchOf,
          id: createId(),
          role: 'assistant',
          content: fallbackSplit?.answer ?? reply,
          reasoningContent: fallbackSplit?.reasoning,
          reasoningEndedAt: fallbackSplit ? Date.now() : undefined,
          reasoningStartedAt: fallbackSplit ? Date.now() : undefined,
          sources: responseSources.length ? responseSources : undefined,
          truncated: responseTruncated || undefined,
          createdAt: Date.now(),
        }
        session.messages.push(assistantMessage)
      }
      session.updatedAt = Date.now()
      this.isResponding = false
      // 请求结束后清空 Store 临时字段，消息对象已持有最终状态。
      this.streamingMessageContent = ''
      this.streamingMessageId = ''
      this.streamingReasoningContent = ''
      this.streamingReasoningEndedAt = 0
      this.streamingReasoningStartedAt = 0
      writeStoredSessions(this.sessions)
    },
    stopResponding() {
      // 先取消网络，再清理所有流式展示状态。
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
      // 该方法只负责 API 协议与工具调用，通过回调把增量状态交给上层。
      if (!BIGMODEL_API_KEY) {
        const message = '还没有配置 BigModel API Key。请在 src/stores/chat.ts 顶部的 BIGMODEL_API_KEY 里填入你的 Key。'
        await options.onError?.(message)
        return ''
      }

      const storedWebSearch = readStoredWebSearchEnabled()
      const storedAgentMode = readStoredAgentModeEnabled()
      // 显式发送选项和已持久化工具状态取并集。
      const webSearchEnabled = Boolean(options.webSearch) || storedWebSearch
      const agentModeEnabled = Boolean(options.agentMode) || storedAgentMode
      const systemPrompt = [
        // 各模式只通过系统提示和工具声明叠加，不改变会话消息本身。
        options.systemPrompt ?? SYSTEM_PROMPT,
        options.deepThinking ? DEEP_THINKING_PROMPT : '',
        webSearchEnabled ? WEB_SEARCH_PROMPT : '',
        agentModeEnabled ? AGENT_MODE_PROMPT : '',
      ]
        .filter(Boolean)
        .join('\n')
      const apiMessages = buildApiMessages(messages, systemPrompt, options.contextClearedAt)
      // maxTokens=0 表示交由估算函数根据上下文自适应。
      const maxTokens = options.maxTokens
        ? clamp(Math.round(options.maxTokens), 512, DEEP_THINKING_OUTPUT_TOKEN_LIMIT)
        : estimateMaxTokens(apiMessages, options.deepThinking)
      const temperature = options.temperature === undefined
        ? 1
        : clamp(Number(options.temperature), 0, 2)
      const tools = buildRequestTools(webSearchEnabled, agentModeEnabled)
      // 请求体保持 OpenAI 兼容格式，同时附加供应商 thinking 配置。
      const requestBody: Record<string, unknown> = {
        model: BIGMODEL_MODEL,
        messages: apiMessages,
        thinking: {
          type: options.deepThinking ? 'enabled' : 'disabled',
          clear_thinking: true,
        },
        tools,
        tool_choice: 'auto',
        max_tokens: maxTokens,
        stream: true,
        temperature,
      }

      if (agentModeEnabled) {
        // Agent 模式需要接收流式工具参数，普通问答无需开启。
        requestBody.tool_stream = true
      }

      if (import.meta.env.DEV) {
        // 开发日志只输出开关和数值，不打印用户消息或 API Key。
        console.info('AI request options ' + JSON.stringify({
          agentMode: agentModeEnabled,
          deepThinking: Boolean(options.deepThinking),
          optionAgentMode: Boolean(options.agentMode),
          optionWebSearch: Boolean(options.webSearch),
          storedAgentMode,
          storedWebSearch,
          maxTokens,
          temperature,
          contextClearedAt: options.contextClearedAt ?? 0,
          webSearch: webSearchEnabled,
          toolCount: tools.length,
        }))
      }

      try {
        // 第一轮请求可能直接返回答案，也可能只返回 Agent 工具调用。
        const response = await fetch(BIGMODEL_API_URL, {
          method: 'POST',
          headers: {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${BIGMODEL_API_KEY}`,
          },
          body: JSON.stringify(requestBody),
          signal: options.signal,
        })

        if (!response.ok) {
          throw new Error(await readErrorResponse(response))
        }

        const reply = await readStreamResponse(response, options.onToken, options.onReasoning, options.signal)
        // 先上报第一轮的截断和来源信息。
        await options.onFinish?.(['length', 'max_tokens'].includes(reply.finishReason.toLowerCase()))
        if (reply.sources.length) {
          await options.onSources?.(reply.sources)
        }
        if (agentModeEnabled && reply.toolCalls.length) {
          // 第一轮只决定工具调用；本地执行后把结果交回模型生成最终回答。
          const toolMessages = reply.toolCalls.map((toolCall) => ({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: executeAgentTool(toolCall, messages),
          })) satisfies ApiMessage[]
          const followUpMessages = [
            // 第二轮上下文包含模型的工具调用声明及每个工具的执行结果。
            ...apiMessages,
            {
              role: 'assistant',
              content: reply.text,
              tool_calls: reply.toolCalls,
            },
            ...toolMessages,
          ] satisfies ApiMessage[]
          const followUpRequestBody: Record<string, unknown> = {
            // 禁止第二轮再次调用工具，避免前端进入无限工具循环。
            ...requestBody,
            messages: followUpMessages,
            tool_choice: 'none',
            tool_stream: false,
          }
          const followUpResponse = await fetch(BIGMODEL_API_URL, {
            method: 'POST',
            headers: {
              Accept: 'text/event-stream',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${BIGMODEL_API_KEY}`,
            },
            body: JSON.stringify(followUpRequestBody),
            signal: options.signal,
          })

          if (!followUpResponse.ok) {
            throw new Error(await readErrorResponse(followUpResponse))
          }

          const finalReply = await readStreamResponse(followUpResponse, options.onToken, options.onReasoning, options.signal)
          await options.onFinish?.(['length', 'max_tokens'].includes(finalReply.finishReason.toLowerCase()))
          if (finalReply.sources.length) {
            await options.onSources?.(finalReply.sources)
          }
          if (finalReply.text) return finalReply.text
        }

        if (reply.text) return reply.text

        // 无文本且无可执行工具时视为协议异常。
        console.warn('GLM response without readable content')
        await options.onError?.('接口没有返回可读取的内容，请稍后重试')
        return ''
      } catch (error) {
        // 用户主动停止不显示错误提示。
        if (error instanceof DOMException && error.name === 'AbortError') return ''
        console.error(error)
        const message = error instanceof Error ? error.message : String(error)
        await options.onError?.(message)
        return ''
      }
    },
  },
})
