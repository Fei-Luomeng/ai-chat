<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChatDotRound, Delete, EditPen, Plus, Promotion } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
const draft = ref('')
const messagesRef = ref<HTMLElement | null>(null)

const activeSession = computed(() => chatStore.activeSession)
const hasDraft = computed(() => draft.value.trim().length > 0)

const promptExamples = [
  '帮我把这个项目接入 OpenAI API',
  '写一个产品需求文档的大纲',
  '解释 Vue3 中 Pinia 的最佳实践',
]

const scrollToBottom = async () => {
  await nextTick()
  if (!messagesRef.value) return
  messagesRef.value.scrollTop = messagesRef.value.scrollHeight
}

watch(
  () => activeSession.value?.messages.length,
  () => {
    void scrollToBottom()
  },
)

const send = async () => {
  if (!hasDraft.value) return

  const content = draft.value
  draft.value = ''
  await chatStore.sendMessage(content)
}

const usePrompt = (prompt: string) => {
  draft.value = prompt
}

const clearChat = () => {
  chatStore.clearActiveSession()
  ElMessage.success('已清空当前会话')
}

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
</script>

<template>
  <main class="chat-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">
          <ChatDotRound :size="22" />
        </span>
        <div>
          <strong>AI Chat</strong>
          <span>Vue3 Assistant</span>
        </div>
      </div>

      <el-button class="new-chat" type="primary" :icon="Plus" @click="chatStore.createSession">
        新建对话
      </el-button>

      <div class="session-list">
        <button
          v-for="session in chatStore.sessions"
          :key="session.id"
          class="session-item"
          :class="{ active: session.id === chatStore.activeSessionId }"
          type="button"
          @click="chatStore.switchSession(session.id)"
        >
          <EditPen :size="16" />
          <span>{{ session.title }}</span>
        </button>
      </div>
    </aside>

    <section class="conversation">
      <header class="conversation-header">
        <div>
          <p>当前会话</p>
          <h1>{{ activeSession?.title }}</h1>
        </div>
        <el-tooltip content="清空当前会话" placement="bottom">
          <el-button :icon="Delete" circle @click="clearChat" />
        </el-tooltip>
      </header>

      <div ref="messagesRef" class="messages">
        <article
          v-for="message in activeSession?.messages"
          :key="message.id"
          class="message-row"
          :class="message.role"
        >
          <div class="avatar">{{ message.role === 'assistant' ? 'AI' : '你' }}</div>
          <div class="message-bubble">
            <div class="message-meta">
              <strong>{{ message.role === 'assistant' ? 'Assistant' : 'You' }}</strong>
              <span>{{ formatTime(message.createdAt) }}</span>
            </div>
            <p>{{ message.content }}</p>
          </div>
        </article>

        <article v-if="chatStore.isResponding" class="message-row assistant">
          <div class="avatar">AI</div>
          <div class="message-bubble typing">
            <span />
            <span />
            <span />
          </div>
        </article>
      </div>

      <div class="composer-panel">
        <div class="prompt-row">
          <el-button
            v-for="prompt in promptExamples"
            :key="prompt"
            size="small"
            plain
            @click="usePrompt(prompt)"
          >
            {{ prompt }}
          </el-button>
        </div>

        <div class="composer">
          <el-input
            v-model="draft"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 5 }"
            resize="none"
            placeholder="输入消息，按 Enter 发送，Shift + Enter 换行"
            @keydown.enter.exact.prevent="send"
          />
          <el-button
            type="primary"
            :icon="Promotion"
            :disabled="!hasDraft"
            :loading="chatStore.isResponding"
            circle
            @click="send"
          />
        </div>
      </div>
    </section>
  </main>
</template>
