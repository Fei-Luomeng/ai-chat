<template>
  <div
    ref="messagesElement"
    class="messages"
    @click="emit('messageAreaClick', $event)"
    @scroll="emit('messageAreaScroll')"
  >
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
        </div>
        <div v-if="!isResponding && editingMessageId !== message.id" class="message-actions">
          <button type="button" aria-label="复制消息" title="复制" @click="emit('copyMessage', message)">
            <CopyDocument :size="15" />
            <span>复制</span>
          </button>
          <button
            v-if="message.role === 'assistant' && hasPreviousUserMessage(message)"
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
</template>

<script setup lang="ts">
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChatDotRound,
  CopyDocument,
  RefreshRight,
} from '@element-plus/icons-vue'
import { onMounted, ref } from 'vue'

import MessageSources from '@/components/chat/MessageSources.vue'
import { stripFinalAnswerMarker, type ChatMessage } from '@/stores/chat'
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

defineProps<{
  activeMessageId: string
  editingDraft: string
  editingMessageId: string
  getAnswerContent: (message: ChatMessage) => string
  getBranchSwitcher: (message: ChatMessage) => BranchSwitcher | null
  getReasoningContent: (message: ChatMessage) => string
  getReasoningLabel: (message: ChatMessage) => string
  hasPreviousUserMessage: (message: ChatMessage) => boolean
  highlightedMessageId: string
  hoveredNavigatorItem: { label: string; right: number; top: number } | null
  isReasoningOpen: (messageId: string) => boolean
  isResponding: boolean
  isWaitingForFirstToken: boolean
  messages: ChatMessage[]
  navigatorItems: NavigatorItem[]
  streamingAssistantMessageContent: string
  streamingAssistantMessageId: string
}>()

const emit = defineEmits<{
  branchFromAssistant: [message: ChatMessage]
  cancelEditing: []
  copyMessage: [message: ChatMessage]
  editMessage: [message: ChatMessage]
  hideNavigatorTooltip: []
  jumpToMessage: [messageId: string]
  messageAreaClick: [event: MouseEvent]
  messageAreaReady: [element: HTMLElement]
  messageAreaScroll: []
  regenerate: [message: ChatMessage]
  selectBranch: [sourceId: string, nextIndex: number]
  showNavigatorTooltip: [item: NavigatorItem, event: Event]
  submitEditedMessage: [message: ChatMessage]
  toggleFavorite: [message: ChatMessage]
  toggleReasoning: [messageId: string]
  updateEditingDraft: [value: string]
}>()

const messagesElement = ref<HTMLElement | null>(null)

onMounted(() => {
  if (messagesElement.value) emit('messageAreaReady', messagesElement.value)
})
</script>
