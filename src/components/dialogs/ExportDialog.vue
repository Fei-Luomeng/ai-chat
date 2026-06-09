<template>
  <div v-if="open" class="confirm-overlay" @click.self="emit('close')">
    <section class="export-dialog" @click.stop>
      <header>
        <div><p>导出对话</p><h2>{{ title }}</h2></div>
        <button type="button" aria-label="关闭导出" @click="emit('close')"><Close :size="18" /></button>
      </header>
      <div class="export-body">
        <div class="export-mode">
          <button type="button" :class="{ active: mode === 'all' }" @click="emit('updateMode', 'all')">全部导出</button>
          <button type="button" :class="{ active: mode === 'selected' }" @click="emit('updateMode', 'selected')">选择消息</button>
        </div>
        <p class="export-summary">
          {{ mode === 'all' ? `将导出全部 ${messages.length} 条消息。` : `将导出已选择的 ${selectedTotal} 条消息。` }}
        </p>
        <div v-if="mode === 'selected'" class="export-message-list">
          <button
            v-for="message in messages"
            :key="`export-${message.id}`"
            type="button"
            class="export-message-item"
            :class="{ selected: selectedIds.includes(message.id) }"
            @click="emit('toggleMessage', message.id)"
          >
            <span class="export-check" />
            <span>
              <strong>{{ message.role === 'assistant' ? 'AI Chat' : '你' }} · {{ formatTime(message.createdAt) }}</strong>
              <small>{{ getPreview(message) }}</small>
            </span>
          </button>
        </div>
      </div>
      <footer>
        <button class="cancel-settings" type="button" @click="emit('close')">取消</button>
        <button class="confirm-primary" type="button" @click="emit('confirm')">确认导出</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Close } from '@element-plus/icons-vue'

import type { ChatMessage } from '@/stores/chat'

defineProps<{
  getPreview: (message: ChatMessage) => string
  messages: ChatMessage[]
  mode: 'all' | 'selected'
  open: boolean
  selectedIds: string[]
  selectedTotal: number
  title: string
}>()

const emit = defineEmits<{
  close: []
  confirm: []
  toggleMessage: [id: string]
  updateMode: [mode: 'all' | 'selected']
}>()

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(timestamp)
</script>
