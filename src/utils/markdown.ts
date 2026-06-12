import MarkdownIt from 'markdown-it'

import type { WebSearchSource } from '@/stores/chat'

// 所有自定义 HTML 片段中的动态内容都必须先转义。
const escapeHtml = (content: string) =>
  // 连续调用 replace 会依次返回新字符串，原始 content 不会被修改。
  content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const isJavascriptLanguage = (lang: string) =>
  // 只对可安全进行简单修复的 JS/TS 代码启用格式化。
  ['javascript', 'typescript', 'js', 'ts'].includes(lang.toLowerCase())

const formatJavascriptCode = (code: string) => {
  // 模型偶尔把代码压成一行，这里只做保守的空格、换行和缩进修复。
  const repaired = code
    .replace(/\bfunction([A-Za-z_$])/g, 'function $1')
    .replace(/\breturnfunction\b/g, 'return function')
    .replace(/\b(const|let|var)([A-Za-z_$])/g, '$1 $2')
    .replace(/\b(if|for|while|switch|catch)(?=\()/g, '$1 ')
    .replace(/,(?=\S)/g, ', ')
    .replace(/\/\/\s*/g, '\n// ')
    .replace(/\{/g, ' {\n')
    .replace(/;/g, ';\n')
    .replace(/\}/g, '\n}\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\n}\n;\n/g, '\n};\n')

  // depth 是当前花括号嵌套层级；普通变量即可，因为它不参与 Vue 响应式渲染。
  let depth = 0

  // 根据花括号维护缩进层级，不尝试实现完整 JavaScript 解析器。
  return repaired
    .split('\n')
    // map 是逐项转换；filter(Boolean) 会移除空字符串等假值；最后一个 map 再添加缩进。
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('}')) depth = Math.max(0, depth - 1)

      const formattedLine = `${'  '.repeat(depth)}${line}`
      if (line.endsWith('{')) depth += 1

      return formattedLine
    })
    .join('\n')
}

const formatCodeContent = (lang: string, code: string[]) => {
  // 其他语言保持原始文本，避免错误格式化破坏语义。
  const rawCode = code.join('\n').trimEnd()
  return isJavascriptLanguage(lang) ? formatJavascriptCode(rawCode) : rawCode
}

const renderCodeBlock = (lang: string, code: string[]) => [
  // 这里先用字符串数组描述 HTML，最后 join('') 拼成一个完整字符串。
  // 复制按钮由消息容器事件委托处理，不在 HTML 字符串中绑定事件。
  '<div class="code-card">',
  '<button class="code-copy" type="button" aria-label="复制代码"><span></span></button>',
  `<pre><code data-lang="${escapeHtml(lang)}">${escapeHtml(formatCodeContent(lang, code))}</code></pre>`,
  '</div>',
].join('')

const codeLanguages = [
  // 用于修复语言标记与首行代码粘连的常见模型输出。
  'javascript',
  'typescript',
  'python',
  'bash',
  'shell',
  'html',
  'json',
  'css',
  'vue',
  'js',
  'ts',
]

const MARKDOWN_BOUNDARY = '\u200a'

// CommonMark 不识别紧贴中文的 **粗体**，临时补边界后再从最终 HTML 中移除。
const normalizeTightStrongMarkers = (content: string) =>
  // replace 使用函数作为第二个参数时，每次正则命中都会调用该函数。
  // 参数依次包含完整匹配、捕获组、匹配位置和原字符串。
  content.replace(/\*\*([^\n*](?:[^*\n]|\*(?!\*))*)\*\*/g, (match, inner, offset, source) => {
    const previous = source[offset - 1] ?? ''
    const next = source[offset + match.length] ?? ''
    const before = previous && !/[\s*]/.test(previous) ? MARKDOWN_BOUNDARY : ''
    const after = next && !/[\s*]/.test(next) ? MARKDOWN_BOUNDARY : ''

    return `${before}**${inner}**${after}`
  })

const normalizeMarkdownContent = (content: string) => {
  // 在交给 markdown-it 前修正常见的围栏和标题格式错误。
  const languagePattern = codeLanguages.join('|')
  // RegExp 构造函数适合需要把 languagePattern 变量动态插入正则的场景。
  const gluedFence = new RegExp(`\`{3}(${languagePattern})(?=\\S)`, 'gi')
  const openingFence = new RegExp(`([^\\n])(\`{3}(?:${languagePattern})?(?:\\s|\\n|$))`, 'gi')

  return normalizeTightStrongMarkers(content)
    .replace(gluedFence, '```$1\n')
    .replace(openingFence, '$1\n$2')
    .replace(/^\\(#{1,6}\s+)/gm, '$1')
    .replace(/^(#{1,6})\s+(#{1,6}\s+)/gm, '$2')
    .replace(/([。！？：:；;）)])\s*(#{1,6})(?=\S)/g, '$1\n\n$2')
    .replace(/^(#{1,6})(\S)/gm, '$1 $2')
}

const addCitationLinks = (content: string, sources: WebSearchSource[]) => {
  // 模型返回的 ref 编号不一定等于卡片顺序，渲染前统一映射为可点击的来源序号。
  // Map 与普通对象类似，但键可以明确声明为 number，并提供 has/get/set 等方法。
  const sourceByReferNumber = new Map<number, { cardNumber: number; url: string }>()
  sources.forEach((source, index) => {
    const cardNumber = index + 1
    // ?. 是可选链，中间任何一步为 null/undefined 时整段返回 undefined。
    // ?? 只在左侧为 null/undefined 时采用默认值，不会把 0 或空字符串误判为缺失。
    const referNumber = Number(source.refer?.match(/\d+/)?.[0] ?? cardNumber)
    sourceByReferNumber.set(referNumber, { cardNumber, url: source.url })

    if (!sourceByReferNumber.has(cardNumber)) {
      sourceByReferNumber.set(cardNumber, { cardNumber, url: source.url })
    }
  })

  const citation = (rawNumber: string, fallback: string) => {
    // 有来源时生成真实链接，无来源时生成可识别的占位锚点。
    const source = sourceByReferNumber.get(Number(rawNumber))
    if (source) return `[${source.cardNumber}](<${source.url}>)`

    const number = Number(rawNumber)
    return Number.isFinite(number) ? `[${number}](#missing-source-${number})` : fallback
  }
  const replaceCitation = (match: string, rawNumber: string) => citation(rawNumber, match)

  return content
    // 依次兼容中文方括号、Markdown 方括号和裸 ref_1。
    .replace(/【\s*(?:ref\s*\\?_\s*)?(\d+)\s*】/gi, replaceCitation)
    .replace(/\[\s*(?:ref\s*\\?_\s*)?(\d+)\s*\](?!\s*\()/gi, replaceCitation)
    .replace(/(?<![\w])ref\\?_(\d+)(?![\w])/gi, replaceCitation)
}

const markdown = new MarkdownIt({
  // 禁止模型直接注入 HTML；链接识别和换行行为保持保守。
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
})

// 保存 markdown-it 默认链接渲染器，定制属性后仍可复用其标准 HTML 输出逻辑。
const defaultLinkOpen = markdown.renderer.rules.link_open
// 这里没有给 tokens、index 等参数手写类型，因为赋值目标 link_open 已经有函数类型。
// TS 会从 markdown-it 的类型声明反向推断每个参数，这叫“上下文类型推断”。
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  // 所有链接在新标签页打开并禁止传递 opener。
  const token = tokens[index]
  if (!token) return ''

  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noreferrer')
  const href = token.attrGet('href')
  // as 是类型断言，只告诉 TypeScript 按该结构检查，不会在运行时转换 env。
  // `{ sourceUrls?: string[] }` 是临时内联对象类型，表示 sourceUrls 可以不存在，
  // 存在时必须是字符串数组；随后 `?? []` 在缺失时提供空数组。
  const sourceUrls = (env as { sourceUrls?: string[] }).sourceUrls ?? []
  const sourceIndex = href ? sourceUrls.indexOf(href) : -1
  if (sourceIndex >= 0) {
    // data-source-index 供消息组件实现引用悬浮预览和来源卡片联动。
    token.attrJoin('class', 'citation-link')
    token.attrSet('data-source-index', String(sourceIndex))
    token.attrSet('aria-label', `查看来源 ${sourceIndex + 1}`)
  } else if (href?.startsWith('#missing-source-')) {
    token.attrJoin('class', 'citation-link citation-missing')
    token.attrSet('aria-label', '来源链接未返回')
    token.attrSet('title', '接口未返回该来源的链接')
  }

  return defaultLinkOpen
    ? defaultLinkOpen(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options)
}

markdown.renderer.rules.fence = (tokens, index) => {
  // 围栏代码和缩进代码统一使用同一代码卡片外观。
  const token = tokens[index]
  if (!token) return ''

  const lang = token.info.trim().split(/\s+/)[0] ?? ''
  return renderCodeBlock(lang, token.content.split('\n'))
}

markdown.renderer.rules.code_block = (tokens, index) => {
  const token = tokens[index]
  return token ? renderCodeBlock('', token.content.split('\n')) : ''
}

markdown.core.ruler.after('inline', 'clean_repeated_heading_marks', (state) => {
  // ruler.after 表示在 inline 解析规则之后插入一个自定义 token 清理步骤。
  // 模型可能输出“## ## 标题”，在 token 阶段移除重复井号。
  state.tokens.forEach((token, index) => {
    if (token.type !== 'inline' || state.tokens[index - 1]?.type !== 'heading_open') return

    token.content = token.content.replace(/^#{1,6}\s+/, '')
    token.children?.forEach((child) => {
      if (child.type === 'text') {
        child.content = child.content.replace(/^#{1,6}\s+/, '')
      }
    })
  })
})

export const renderMarkdown = (content: string, sources: WebSearchSource[] = []) =>
  // sources 默认空数组，因此普通回答调用时可以只传 content。
  // 渲染顺序：引用链接化 -> Markdown 修复 -> HTML 渲染 -> 删除临时边界字符。
  markdown.render(
    normalizeMarkdownContent(addCitationLinks(content, sources)),
    { sourceUrls: sources.map((source) => source.url) },
  ).replaceAll(MARKDOWN_BOUNDARY, '')
