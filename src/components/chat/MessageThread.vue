<template>
  <div
    ref="messagesElement"
    class="messages"
    @click="handleMessageClick"
    @mouseover="showCitationPreview"
    @mouseout="hideCitationPreview"
    @scroll="emit('messageAreaScroll')"
  >
    <button
      v-if="hiddenMessageCount"
      class="load-earlier-messages"
      type="button"
      @click="emit('loadEarlier')"
    >
      <ArrowUp :size="15" />
      <span>加载更早的 {{ Math.min(hiddenMessageCount, 80) }} 条消息</span>
    </button>
    <article
      v-for="message in messages"
      :key="message.id"
      :data-message-id="message.id"
      :data-message-role="message.role"
      class="message-row"
      :class="[message.role, { 'search-highlight': message.id === highlightedMessageId }]"
    >
      <div class="avatar">{{ message.role === 'assistant' ? 'AI' : '你' }}</div>
      <div class="message-content">
        <div class="message-meta">
          <strong>{{ message.role === 'assistant' ? 'AI Chat' : '你' }}</strong>
          <div v-if="getBranchSwitcher(message)" class="branch-switcher" aria-label="切换消息分支">
            <button
              type="button"
              aria-label="上一个分支"
              :disabled="getBranchSwitcher(message)!.index === 0"
              @click="emit('selectBranch', getBranchSwitcher(message)!.sourceId, getBranchSwitcher(message)!.index - 1)"
            >
              <ArrowLeft :size="14" />
            </button>
            <span>{{ getBranchSwitcher(message)!.index + 1 }} / {{ getBranchSwitcher(message)!.total }}</span>
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
          <div v-if="message.role === 'user' && editingMessageId === message.id" class="message-editor">
            <textarea
              :value="editingDraft"
              rows="4"
              @input="emit('updateEditingDraft', ($event.target as HTMLTextAreaElement).value)"
            />
            <div class="message-editor-actions">
              <button type="button" @click="emit('submitEditedMessage', message)">发送</button>
              <button type="button" @click="emit('cancelEditing')">取消</button>
            </div>
          </div>
          <template v-else>
            <div v-if="message.role === 'assistant' && getReasoningContent(message)" class="reasoning-panel">
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
              <div v-show="isReasoningOpen(message.id)" class="reasoning-content">
                <div class="reasoning-markdown markdown-body" v-html="renderMarkdown(getReasoningContent(message))" />
              </div>
            </div>
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
            <button type="button" @click="emit('retryMessage', message)">
              <RefreshRight :size="15" />
              <span>重试</span>
            </button>
          </section>
          <div
            v-if="message.role === 'assistant' && message.truncated && !message.error"
            class="continue-generation"
          >
            <span>回答因长度限制中断</span>
            <button type="button" @click="emit('continueMessage', message)">
              <RefreshRight :size="15" />
              <span>继续生成</span>
            </button>
          </div>
        </div>
        <div
          v-if="
            !isResponding &&
            editingMessageId !== message.id &&
            !(message.role === 'assistant' && message.error && !message.content)
          "
          class="message-actions"
        >
          <button type="button" aria-label="复制消息" title="复制" @click="emit('copyMessage', message)">
            <CopyDocument :size="15" />
            <span>复制</span>
          </button>
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
          <button v-if="message.role === 'assistant'" type="button" @click="emit('toggleFavorite', message)">
            {{ message.favorited ? '取消收藏' : '收藏' }}
          </button>
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
          <button
            v-if="message.role === 'assistant' && spokenMessageId === message.id"
            type="button"
            aria-label="停止朗读"
            @click="emit('stopSpeech')"
          >
            <Close :size="15" />
            <span>停止</span>
          </button>
          <button v-if="message.role === 'assistant'" type="button" @click="emit('branchFromAssistant', message)">
            新分支
          </button>
          <button v-if="message.role === 'user'" type="button" @click="emit('editMessage', message)">编辑</button>
        </div>
      </div>
    </article>

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

  <aside v-if="navigatorItems.length" class="message-navigator" aria-label="当前对话导航">
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

  <div
    v-if="hoveredNavigatorItem"
    class="message-nav-tooltip"
    :style="{ right: `${hoveredNavigatorItem.right}px`, top: `${hoveredNavigatorItem.top}px` }"
  >
    {{ hoveredNavigatorItem.label }}
  </div>

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
import { onBeforeUnmount, onMounted, ref } from 'vue'

import MessageSources from '@/components/chat/MessageSources.vue'
import { stripFinalAnswerMarker, type ChatMessage, type WebSearchSource } from '@/stores/chat'
import { renderMarkdown } from '@/utils/markdown'

interface BranchSwitcher {
  index: number
  sourceId: string
  total: number
}

interface NavigatorItem {
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

const props = defineProps<{
  activeMessageId: string
  editingDraft: string
  editingMessageId: string
  getAnswerContent: (message: ChatMessage) => string
  getBranchSwitcher: (message: ChatMessage) => BranchSwitcher | null
  getReasoningContent: (message: ChatMessage) => string
  getReasoningLabel: (message: ChatMessage) => string
  hasPreviousUserMessage: (message: ChatMessage) => boolean
  highlightedMessageId: string
  hiddenMessageCount: number
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

const messagesElement = ref<HTMLElement | null>(null)
const citationPreview = ref<CitationPreview | null>(null)
let highlightedSourceCard: HTMLElement | null = null
let sourceHighlightTimer: number | undefined

const getSpeechButtonLabel = (message: ChatMessage) => {
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
  const citation = (target as HTMLElement | null)?.closest<HTMLAnchorElement>(
    '.citation-link:not(.citation-missing)',
  )
  const row = citation?.closest<HTMLElement>('[data-message-id]')
  const sourceIndex = Number(citation?.dataset.sourceIndex)
  const message = props.messages.find((item) => item.id === row?.dataset.messageId)
  const source = message?.sources?.[sourceIndex]

  if (!citation || !row || !Number.isInteger(sourceIndex) || !source) return null
  return { citation, row, source, sourceIndex }
}

const showCitationPreview = (event: MouseEvent) => {
  const context = getCitationContext(event.target)
  if (!context) return

  const bounds = context.citation.getBoundingClientRect()
  const previewWidth = Math.min(320, window.innerWidth - 24)
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

  highlightedSourceCard = sourceCard
  sourceCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
  sourceCard.classList.add('source-card-highlight')
  sourceHighlightTimer = window.setTimeout(() => {
    sourceCard.classList.remove('source-card-highlight')
    if (highlightedSourceCard === sourceCard) highlightedSourceCard = null
    sourceHighlightTimer = undefined
  }, 1800)
  return true
}

const handleMessageClick = (event: MouseEvent) => {
  focusCitationSource(event)
  emit('messageAreaClick', event)
}

onMounted(() => {
  if (messagesElement.value) emit('messageAreaReady', messagesElement.value)
})

onBeforeUnmount(() => {
  if (sourceHighlightTimer !== undefined) window.clearTimeout(sourceHighlightTimer)
  highlightedSourceCard?.classList.remove('source-card-highlight')
})
</script>
