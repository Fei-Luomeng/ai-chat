import type { ChatMessage, ChatSession } from '@/stores/chat'
// import type 只导入类型，编译后这条 import 会被删除，不会产生运行时依赖。
// TypeScript 的类型只在开发和编译阶段帮助检查代码，浏览器实际运行的是去掉类型后的 JavaScript。
// 所以不能把 import type 导入的 ChatMessage 当成构造函数使用，也不能在运行时用它做 instanceof 判断。

// 通用确认弹窗的判别联合，type 决定其余字段是否合法。
// type 用来给一段类型起别名；等号右侧不是在创建对象，而是在描述“合法对象可以长什么样”。
export type ActionDialogState =
  // 竖线 | 表示“多种结构中的一种”。type 字段取值不同，其余允许的字段也不同。
  | { type: 'create-project'; value: string }
  | { projectName: string; type: 'delete-project' | 'rename-project'; value: string }
  | { sessionId: string; type: 'delete-session' | 'rename-session'; value: string }

// interface 也是描述对象结构的方式。这里的 `id: string` 可以从左到右读成：
// “id 字段必须存在，并且它的值必须是字符串”。冒号后面写的是类型，不是字段的默认值。
export interface FavoriteResult {
  // 收藏结果保存原对象引用，取消收藏时可直接修改原消息。
  id: string
  // message/session 保留原对象引用，因此取消收藏时可以直接修改真实消息。
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
  // maxTokens=0 在请求层表示自动估算，并不表示禁止模型输出。
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
  // 字段名后的 ? 表示这个字段可以不存在。
  // `createdAt?: number` 大致等价于“读取时可能得到 number 或 undefined”，
  // 因此使用它之前通常要先判断，或者使用 `createdAt ?? 默认值`。
  // messageId 缺失表示标题命中，只需打开会话而无需定位消息。
  createdAt?: number
  id: string
  messageId?: string
  preview: string
  projectName?: string
  // projectName 用于区分普通会话和项目会话的跳转路径。
  // ChatMessage['role'] 是索引访问类型：直接复用 ChatMessage 中 role 字段的类型，
  // 避免这里再次手写 'user' | 'assistant' 后与消息类型不一致。
  role?: ChatMessage['role']
  session: ChatSession
  title: string
  type: 'title' | 'message'
}
