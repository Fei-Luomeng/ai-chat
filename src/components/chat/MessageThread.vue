<template>
  <!-- 消息滚动容器统一承接代码复制、引用悬浮和滚动位置监听。 -->
  <div
    ref="messagesElement"
    class="messages"
    @click="handleMessageClick"
    @mouseover="showCitationPreview"
    @mouseout="hideCitationPreview"
    @scroll="emit('messageAreaScroll')"
  >
    <!-- 加载更早消息按钮：扩大当前渲染窗口，每次最多补出前面的 80 条消息。 -->
    <button
      v-if="hiddenMessageCount"
      class="load-earlier-messages"
      type="button"
      @click="emit('loadEarlier')"
    >
      <ArrowUp :size="15" />
      <span>加载更早的 {{ Math.min(hiddenMessageCount, 80) }} 条消息</span>
    </button>
    <!-- 每条消息保留 id 和 role 数据属性，供搜索定位与滚动导航使用。 -->
    <article
      v-for="message in messages"
      :key="message.id"
      :data-message-id="message.id"
      :data-message-role="message.role"
      class="message-row"
      :class="[message.role, { 'search-highlight': message.id === highlightedMessageId }]"
    >
      <!-- message.id 作为 key，流式更新 content 时 Vue 会复用同一 article 而不是重建。 -->
      <div class="avatar">{{ message.role === 'assistant' ? 'AI' : '你' }}</div>
      <div class="message-content">
        <!-- 元信息区同时承载作者、分支切换器和发送时间。 -->
        <div class="message-meta">
          <strong>{{ message.role === 'assistant' ? 'AI Chat' : '你' }}</strong>
          <!-- getBranchSwitcher 返回 null 表示没有分支；有值时才显示左右切换器。 -->
          <div v-if="getBranchSwitcher(message)" class="branch-switcher" aria-label="切换消息分支">
            <!-- ! 是非空断言：外层 v-if 已确认返回值存在，这里告诉 TypeScript 可安全读取。 -->
            <!-- 左按钮切换到上一个回答分支；已经是第一项时禁用。 -->
            <button
              type="button"
              aria-label="上一个分支"
              :disabled="getBranchSwitcher(message)!.index === 0"
              @click="emit('selectBranch', getBranchSwitcher(message)!.sourceId, getBranchSwitcher(message)!.index - 1)"
            >
              <ArrowLeft :size="14" />
            </button>
            <span>{{ getBranchSwitcher(message)!.index + 1 }} / {{ getBranchSwitcher(message)!.total }}</span>
            <!-- 右按钮切换到下一个回答分支；已经是最后一项时禁用。 -->
            <button
              type="button"
              aria-label="下一个分支"
              :disabled="getBranchSwitcher(message)!.index === getBranchSwitcher(message)!.total - 1"
              @click="emit('selectBranch', getBranchSwitcher(message)!.sourceId, getBranchSwitcher(message)!.index + 1)"
            >
              <ArrowRight :size="14" />
            </button>
          </div>
          <span>{{ new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(message.createdAt) }}</span>
        </div>
        <div class="message-body">
          <!-- 编辑用户问题不会原地覆盖，而是提交后创建新聊天分支。 -->
          <div v-if="message.role === 'user' && editingMessageId === message.id" class="message-editor">
            <textarea
              :value="editingDraft"
              rows="4"
              @input="emit('updateEditingDraft', ($event.target as HTMLTextAreaElement).value)"
            />
            <div class="message-editor-actions">
              <!-- 发送会基于修改后的问题创建新分支；取消只退出编辑，不保存草稿。 -->
              <button type="button" @click="emit('submitEditedMessage', message)">发送</button>
              <button type="button" @click="emit('cancelEditing')">取消</button>
            </div>
          </div>
          <template v-else>
            <!-- 思考内容与最终答案分开渲染，并允许单条消息折叠。 -->
            <!-- && 是短路与：必须既是助手消息又有思考内容才渲染面板。 -->
            <div v-if="message.role === 'assistant' && getReasoningContent(message)" class="reasoning-panel">
              <!-- 思考过程按钮：展开或折叠当前助手消息的 reasoning 内容。 -->
              <button
                class="reasoning-toggle"
                type="button"
                :aria-expanded="isReasoningOpen(message.id)"
                @click="emit('toggleReasoning', message.id)"
              >
                <ChatDotRound :size="18" />
                <span>{{ getReasoningLabel(message) }}</span>
                <component class="reasoning-chevron" :is="isReasoningOpen(message.id) ? ArrowDown : ArrowRight" :size="15" />
              </button>
              <!-- v-show 只切换 display，不销毁内部 Markdown DOM，频繁折叠时更合适。 -->
              <div v-show="isReasoningOpen(message.id)" class="reasoning-content">
                <div class="reasoning-markdown markdown-body" v-html="renderMarkdown(getReasoningContent(message))" />
              </div>
            </div>
            <!-- 流式消息读取实时缓存，完成后切换为持久化 message.content。 -->
            <div
              v-if="message.id === streamingAssistantMessageId && streamingAssistantMessageContent"
              class="streaming-markdown"
            >
              <div
                class="markdown-body"
                v-html="renderMarkdown(stripFinalAnswerMarker(streamingAssistantMessageContent), message.sources)"
              />
              <span class="stream-cursor" />
            </div>
            <!-- v-html 插入 renderMarkdown 生成的 HTML；动态内容已在 markdown 工具中转义。 -->
            <div
              v-else-if="message.content"
              class="markdown-body"
              v-html="renderMarkdown(getAnswerContent(message), message.sources)"
            />
            <MessageSources
              v-if="message.role === 'assistant' && message.sources?.length"
              :sources="message.sources"
            />
          </template>
          <!-- 请求错误作为消息的一部分保存，便于离开页面后仍可重试。 -->
          <section
            v-if="message.role === 'assistant' && message.error"
            class="generation-error"
            role="alert"
          >
            <WarningFilled :size="18" />
            <div>
              <strong>{{ message.content ? '继续生成失败' : '回答生成失败' }}</strong>
              <p>{{ message.error }}</p>
            </div>
            <!-- 重试按钮：请求失败后，重新生成这条助手回答。 -->
            <button type="button" @click="emit('retryMessage', message)">
              <RefreshRight :size="15" />
              <span>重试</span>
            </button>
          </section>
          <!-- token 上限导致的中断和网络错误使用不同恢复入口。 -->
          <div
            v-if="message.role === 'assistant' && message.truncated && !message.error"
            class="continue-generation"
          >
            <span>回答因长度限制中断</span>
            <!-- 继续生成按钮：保留已有回答，并请求模型从中断位置继续补全。 -->
            <button type="button" @click="emit('continueMessage', message)">
              <RefreshRight :size="15" />
              <span>继续生成</span>
            </button>
          </div>
        </div>
        <!-- 生成期间隐藏操作栏，避免对仍在变化的消息执行操作。 -->
        <div
          v-if="
            !isResponding &&
            editingMessageId !== message.id &&
            !(message.role === 'assistant' && message.error && !message.content)
          "
          class="message-actions"
        >
          <!-- 复制按钮：复制当前消息的纯文本内容，不包含页面按钮和样式。 -->
          <button type="button" aria-label="复制消息" title="复制" @click="emit('copyMessage', message)">
            <CopyDocument :size="15" />
            <span>复制</span>
          </button>
          <!-- 重新生成：根据上一条用户问题再请求一次回答，形成可切换的回答分支。 -->
          <button
            v-if="message.role === 'assistant' && !message.error && hasPreviousUserMessage(message)"
            type="button"
            aria-label="重新生成回答"
            title="重新生成"
            @click="emit('regenerate', message)"
          >
            <RefreshRight :size="15" />
            <span>重新生成</span>
          </button>
          <!-- 收藏按钮：把助手回答加入或移出收藏列表。 -->
          <button v-if="message.role === 'assistant'" type="button" @click="emit('toggleFavorite', message)">
            {{ message.favorited ? '取消收藏' : '收藏' }}
          </button>
          <!-- 朗读按钮：首次点击开始朗读，再次点击可暂停或继续当前消息。 -->
          <button
            v-if="message.role === 'assistant' && speechSynthesisSupported"
            type="button"
            :aria-label="getSpeechButtonLabel(message)"
            :class="{ active: spokenMessageId === message.id }"
            @click="emit('toggleSpeech', message)"
          >
            <VideoPause
              v-if="spokenMessageId === message.id && speechPlaybackState === 'speaking'"
              :size="15"
            />
            <VideoPlay
              v-else-if="spokenMessageId === message.id && speechPlaybackState === 'paused'"
              :size="15"
            />
            <Headset v-else :size="15" />
            <span>{{ getSpeechButtonLabel(message) }}</span>
          </button>
          <!-- 停止按钮：彻底结束当前朗读并把播放状态恢复为空闲。 -->
          <button
            v-if="message.role === 'assistant' && spokenMessageId === message.id"
            type="button"
            aria-label="停止朗读"
            @click="emit('stopSpeech')"
          >
            <Close :size="15" />
            <span>停止</span>
          </button>
          <!-- 新分支：以这条助手回答为上下文起点，新建一条独立聊天会话。 -->
          <button v-if="message.role === 'assistant'" type="button" @click="emit('branchFromAssistant', message)">
            新分支
          </button>
          <!-- 编辑：把用户问题切换成输入框，提交修改后产生新的消息分支。 -->
          <button v-if="message.role === 'user'" type="button" @click="emit('editMessage', message)">编辑</button>
        </div>
      </div>
    </article>

    <!-- 首个 token 到来前尚未创建助手消息，使用独立等待占位。 -->
    <article v-if="isWaitingForFirstToken" class="message-row assistant">
      <div class="avatar">AI</div>
      <div class="message-content">
        <div class="message-meta">
          <strong>AI Chat</strong>
          <span>正在生成</span>
        </div>
        <div class="typing"><span /><span /><span /></div>
      </div>
    </article>
  </div>

  <!-- 右侧导航只索引用户问题，用于快速跳转到对话轮次。 -->
  <aside v-if="navigatorItems.length" class="message-navigator" aria-label="当前对话导航">
    <!-- 每个导航按钮对应一条用户问题；点击后滚动并高亮该轮消息。 -->
    <button
      v-for="item in navigatorItems"
      :key="item.id"
      class="message-nav-item"
      :class="{ active: item.id === activeMessageId }"
      type="button"
      @mouseenter="emit('showNavigatorTooltip', item, $event)"
      @mouseleave="emit('hideNavigatorTooltip')"
      @focus="emit('showNavigatorTooltip', item, $event)"
      @blur="emit('hideNavigatorTooltip')"
      @click="emit('jumpToMessage', item.id)"
    >
      <span>{{ item.label }}</span>
      <i />
    </button>
  </aside>

  <!-- 导航完整标题使用脱离滚动容器的浮层，避免被 overflow 裁切。 -->
  <div
    v-if="hoveredNavigatorItem"
    class="message-nav-tooltip"
    :style="{ right: `${hoveredNavigatorItem.right}px`, top: `${hoveredNavigatorItem.top}px` }"
  >
    {{ hoveredNavigatorItem.label }}
  </div>

  <!-- 行内引用悬浮预览与来源卡片共享同一份 source 数据。 -->
  <aside
    v-if="citationPreview"
    class="citation-preview"
    :style="{ left: `${citationPreview.left}px`, top: `${citationPreview.top}px` }"
    aria-live="polite"
  >
    <div class="citation-preview-heading">
      <span class="citation-preview-icon">
        <span>{{ getSourceInitial(citationPreview.source) }}</span>
        <img
          v-if="citationPreview.source.icon"
          :src="citationPreview.source.icon"
          alt=""
          @error="($event.currentTarget as HTMLImageElement).style.display = 'none'"
        />
      </span>
      <span>
        <strong>来源 {{ citationPreview.number }}</strong>
        <small>{{ getSourceLabel(citationPreview.source) }}</small>
      </span>
    </div>
    <p>{{ citationPreview.source.title }}</p>
    <small v-if="citationPreview.source.snippet" class="citation-preview-snippet">
      {{ citationPreview.source.snippet }}
    </small>
    <span class="citation-preview-hint">点击编号可定位到来源卡片</span>
  </aside>
</template>

<script setup lang="ts">
// 以下均为 Element Plus 图标组件，只负责按钮图形，不包含消息业务逻辑：
// Arrow* 用于上一项、下一项和展开收起；ChatDotRound 用于分支会话；
// Close 用于关闭引用预览；CopyDocument 用于复制；Headset 用于朗读；
// RefreshRight 用于重试；VideoPause/VideoPlay 用于暂停或继续朗读；
// WarningFilled 用于展示消息错误或截断警告。
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChatDotRound,
  Close,
  CopyDocument,
  Headset,
  RefreshRight,
  VideoPause,
  VideoPlay,
  WarningFilled,
} from '@element-plus/icons-vue'
// Vue 生命周期和响应式 API：
// onMounted/onBeforeUnmount 负责注册及清理 DOM 事件，ref 用于保存 DOM 和临时界面状态。
import { onBeforeUnmount, onMounted, ref } from 'vue'

// MessageSources：助手消息下方的联网来源卡片列表。
import MessageSources from '@/components/chat/MessageSources.vue'
// stripFinalAnswerMarker 是清理回答标记的工具函数；ChatMessage/WebSearchSource 是消息和来源类型。
import { stripFinalAnswerMarker, type ChatMessage, type WebSearchSource } from '@/stores/chat'
// renderMarkdown：把助手返回的 Markdown 文本转换成可展示的 HTML。
import { renderMarkdown } from '@/utils/markdown'

interface BranchSwitcher {
  index: number
  sourceId: string
  total: number
}

interface NavigatorItem {
  // interface 只规定对象形状，不会在浏览器中生成类或对象。
  // 创建 NavigatorItem 时，这三个 string 字段必须全部存在。
  fullLabel: string
  id: string
  label: string
}

interface CitationPreview {
  left: number
  number: number
  source: WebSearchSource
  top: number
}

// 保存为 props 变量是因为脚本函数中需要读取属性；模板中则可以直接写属性名。
// defineProps 返回的是响应式只读对象，父组件更新后 props 会自动得到新值。
// 父级提供消息业务函数，本组件只处理消息列表中的局部 DOM 交互。
const props = defineProps<{
  activeMessageId: string
  editingDraft: string
  editingMessageId: string
  // prop 不仅能传数据，也能传函数。这里表示父组件传入的函数接收消息并返回字符串。
  getAnswerContent: (message: ChatMessage) => string
  getBranchSwitcher: (message: ChatMessage) => BranchSwitcher | null
  getReasoningContent: (message: ChatMessage) => string
  getReasoningLabel: (message: ChatMessage) => string
  hasPreviousUserMessage: (message: ChatMessage) => boolean
  highlightedMessageId: string
  hiddenMessageCount: number
  // 对象类型可以直接内联书写；`| null` 表示当前没有悬浮项时保存空值。
  hoveredNavigatorItem: { label: string; right: number; top: number } | null
  isReasoningOpen: (messageId: string) => boolean
  isResponding: boolean
  isWaitingForFirstToken: boolean
  messages: ChatMessage[]
  navigatorItems: NavigatorItem[]
  speechPlaybackState: 'idle' | 'paused' | 'speaking'
  speechSynthesisSupported: boolean
  spokenMessageId: string
  streamingAssistantMessageContent: string
  streamingAssistantMessageId: string
}>()

const emit = defineEmits<{
  // 每个事件右侧都是参数元组。比如 selectBranch 必须按顺序传 string 和 number。
  // 写错事件名、漏传参数或把 nextIndex 传成字符串，TS 都会在编译前提示。
  branchFromAssistant: [message: ChatMessage]
  cancelEditing: []
  copyMessage: [message: ChatMessage]
  continueMessage: [message: ChatMessage]
  editMessage: [message: ChatMessage]
  hideNavigatorTooltip: []
  jumpToMessage: [messageId: string]
  loadEarlier: []
  messageAreaClick: [event: MouseEvent]
  messageAreaReady: [element: HTMLElement]
  messageAreaScroll: []
  regenerate: [message: ChatMessage]
  retryMessage: [message: ChatMessage]
  selectBranch: [sourceId: string, nextIndex: number]
  showNavigatorTooltip: [item: NavigatorItem, event: Event]
  stopSpeech: []
  submitEditedMessage: [message: ChatMessage]
  toggleFavorite: [message: ChatMessage]
  toggleReasoning: [messageId: string]
  toggleSpeech: [message: ChatMessage]
  updateEditingDraft: [value: string]
}>()

// 模板中的 ref="messagesElement" 挂载后会把真实 DOM 元素写入这个 ref。
// 初次执行 setup 时元素还不存在，所以类型必须包含 null。
const messagesElement = ref<HTMLElement | null>(null)
// 引用预览和来源高亮属于短暂 UI 状态，不写入会话数据。
const citationPreview = ref<CitationPreview | null>(null)
let highlightedSourceCard: HTMLElement | null = null
let sourceHighlightTimer: number | undefined

const getSpeechButtonLabel = (message: ChatMessage) => {
  // 非当前朗读消息统一显示“朗读”；当前消息再根据播放状态显示暂停或继续。
  if (props.spokenMessageId !== message.id) return '朗读'
  return props.speechPlaybackState === 'paused' ? '继续' : '暂停'
}

const getSourceLabel = (source: WebSearchSource) => {
  if (source.siteName?.trim()) return source.siteName.trim()

  try {
    return new URL(source.url).hostname.replace(/^www\./, '')
  } catch {
    return '网页来源'
  }
}

const getSourceInitial = (source: WebSearchSource) => getSourceLabel(source).slice(0, 1).toUpperCase()

const getCitationContext = (target: EventTarget | null) => {
  // Markdown 由 v-html 渲染，引用交互只能通过消息容器进行事件委托。
  // closest 会从当前元素开始向父级查找最近的匹配元素。
  // <HTMLAnchorElement> 是泛型参数，让返回值获得链接元素的 href、dataset 等类型。
  const citation = (target as HTMLElement | null)?.closest<HTMLAnchorElement>(
    '.citation-link:not(.citation-missing)',
  )
  const row = citation?.closest<HTMLElement>('[data-message-id]')
  const sourceIndex = Number(citation?.dataset.sourceIndex)
  // find 返回第一条满足条件的数据，找不到时返回 undefined。
  const message = props.messages.find((item) => item.id === row?.dataset.messageId)
  const source = message?.sources?.[sourceIndex]

  if (!citation || !row || !Number.isInteger(sourceIndex) || !source) return null
  return { citation, row, source, sourceIndex }
}

const showCitationPreview = (event: MouseEvent) => {
  const context = getCitationContext(event.target)
  if (!context) return

  // getBoundingClientRect 返回元素相对视口的位置，用于计算 fixed 预览卡片坐标。
  const bounds = context.citation.getBoundingClientRect()
  // 预览卡片限制在视口内，并优先显示在引用编号上方。
  const previewWidth = Math.min(320, window.innerWidth - 24)
  // Math.min 限制右边界，Math.max 再限制左边界，确保卡片不超出屏幕。
  const left = Math.max(
    12,
    Math.min(
      bounds.left + bounds.width / 2 - previewWidth / 2,
      window.innerWidth - previewWidth - 12,
    ),
  )
  const estimatedHeight = context.source.snippet ? 174 : 132
  const top = bounds.top > estimatedHeight + 12
    ? bounds.top - estimatedHeight - 8
    : bounds.bottom + 8

  citationPreview.value = {
    left,
    number: context.sourceIndex + 1,
    source: context.source,
    top: Math.max(12, top),
  }
}

const hideCitationPreview = (event: MouseEvent) => {
  // 只有从引用链接离开时才关闭，消息区其他 mouseout 不应影响预览。
  if (!(event.target as HTMLElement | null)?.closest('.citation-link')) return
  citationPreview.value = null
}

const focusCitationSource = (event: MouseEvent) => {
  const context = getCitationContext(event.target)
  if (!context) return false

  event.preventDefault()
  const sourceCard = context.row.querySelector<HTMLElement>(
    `.source-card[data-source-index="${context.sourceIndex}"]`,
  )
  if (!sourceCard) return true

  citationPreview.value = null
  highlightedSourceCard?.classList.remove('source-card-highlight')
  if (sourceHighlightTimer !== undefined) window.clearTimeout(sourceHighlightTimer)

  // 点击行内编号时滚动到同一消息下的来源卡片，并短暂高亮。
  highlightedSourceCard = sourceCard
  sourceCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
  sourceCard.classList.add('source-card-highlight')
  sourceHighlightTimer = window.setTimeout(() => {
    // 定时移除临时高亮，并确认保存的仍是同一个卡片后再清空引用。
    sourceCard.classList.remove('source-card-highlight')
    if (highlightedSourceCard === sourceCard) highlightedSourceCard = null
    sourceHighlightTimer = undefined
  }, 1800)
  return true
}

const handleMessageClick = (event: MouseEvent) => {
  // 引用定位优先处理，随后继续把点击交给父级识别代码复制按钮。
  focusCitationSource(event)
  emit('messageAreaClick', event)
}

onMounted(() => {
  // 将真实滚动元素交给 useChatApp，用于滚动到底部和搜索定位。
  if (messagesElement.value) emit('messageAreaReady', messagesElement.value)
})

onBeforeUnmount(() => {
  // 普通局部变量不会被 Vue 自动清理，其中保存的计时器仍需要手动取消。
  if (sourceHighlightTimer !== undefined) window.clearTimeout(sourceHighlightTimer)
  highlightedSourceCard?.classList.remove('source-card-highlight')
})
</script>
