<template>
  <!-- 归档和回收站共用列表，通过 mode 切换可用操作。 -->
  <div v-if="open" class="settings-overlay" @click="emit('close')">
    <section class="conversation-manager-dialog" @click.stop>
      <header>
        <div>
          <p>对话管理</p>
          <h2>归档与回收站</h2>
        </div>
        <button type="button" aria-label="关闭对话管理" @click="emit('close')">
          <Close :size="18" />
        </button>
      </header>
      <!-- 数量由父级预先计算，切换 tab 不重新组织原始会话。 -->
      <div class="manager-tabs">
        <button type="button" :class="{ active: mode === 'archived' }" @click="emit('updateMode', 'archived')">
          归档 {{ archivedCount }}
        </button>
        <button type="button" :class="{ active: mode === 'trash' }" @click="emit('updateMode', 'trash')">
          回收站 {{ trashCount }}
        </button>
      </div>
      <!-- 普通会话和项目会话已被拉平成统一 ManagedConversation。 -->
      <div class="conversation-manager-list">
        <article v-for="item in items" :key="`${item.projectName}-${item.session.id}`">
          <div>
            <strong>{{ item.session.title }}</strong>
            <span>{{ item.projectName || '普通对话' }} · {{ formatTime(item.timestamp) }}</span>
          </div>
          <div class="manager-row-actions">
            <button type="button" @click="emit('restore', item)">恢复</button>
            <button
              v-if="mode === 'archived'"
              type="button"
              class="danger"
              @click="emit('trash', item)"
            >
              移到回收站
            </button>
            <button
              v-else
              type="button"
              class="danger"
              @click="emit('remove', item)"
            >
              彻底删除
            </button>
          </div>
        </article>
        <p v-if="items.length === 0" class="manager-empty">
          {{ mode === 'archived' ? '暂无归档对话' : '回收站是空的' }}
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Close } from '@element-plus/icons-vue'

import type { ChatSession } from '@/stores/chat'

export interface ManagedConversation {
  // 空 projectName 表示普通会话，非空值表示所属项目。
  projectName: string
  session: ChatSession
  timestamp: number
}

defineProps<{
  // items 始终只包含当前 mode 对应的数据。
  archivedCount: number
  items: ManagedConversation[]
  mode: 'archived' | 'trash'
  open: boolean
  trashCount: number
}>()

const emit = defineEmits<{
  close: []
  remove: [item: ManagedConversation]
  restore: [item: ManagedConversation]
  trash: [item: ManagedConversation]
  updateMode: [mode: 'archived' | 'trash']
}>()

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
</script>
