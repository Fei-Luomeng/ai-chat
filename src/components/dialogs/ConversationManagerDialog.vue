<template>
  <!-- 归档和回收站共用列表，通过 mode 切换可用操作。 -->
  <div v-if="open" class="settings-overlay" @click="emit('close')">
    <section class="conversation-manager-dialog" @click.stop>
      <header>
        <div>
          <p>对话管理</p>
          <h2>归档与回收站</h2>
        </div>
        <!-- 关闭按钮：退出对话管理，不改变列表中的任何会话。 -->
        <button type="button" aria-label="关闭对话管理" @click="emit('close')">
          <Close :size="18" />
        </button>
      </header>
      <!-- 数量由父级预先计算，切换 tab 不重新组织原始会话。 -->
      <div class="manager-tabs">
        <!-- 两个标签按钮分别查看归档区和回收站，数字表示各自会话数量。 -->
        <button type="button" :class="{ active: mode === 'archived' }" @click="emit('updateMode', 'archived')">
          归档 {{ archivedCount }}
        </button>
        <button type="button" :class="{ active: mode === 'trash' }" @click="emit('updateMode', 'trash')">
          回收站 {{ trashCount }}
        </button>
      </div>
      <!-- 普通会话和项目会话已被拉平成统一 ManagedConversation。 -->
      <div class="conversation-manager-list">
        <!--
          普通会话的 projectName 是空字符串，项目会话则带项目名。
          key 同时拼接项目名和会话 id，避免不同来源的 id 意外重复。
        -->
        <article v-for="item in items" :key="`${item.projectName}-${item.session.id}`">
          <div>
            <strong>{{ item.session.title }}</strong>
            <!-- 这里使用 ||：空字符串也应该回退成“普通对话”，这正是 || 适合的场景。 -->
            <span>{{ item.projectName || '普通对话' }} · {{ formatTime(item.timestamp) }}</span>
          </div>
          <div class="manager-row-actions">
            <!-- 恢复按钮：把会话放回正常列表，并清除归档或删除时间。 -->
            <button type="button" @click="emit('restore', item)">恢复</button>
            <!-- 归档页中可进一步移到回收站，之后仍然可以恢复。 -->
            <button
              v-if="mode === 'archived'"
              type="button"
              class="danger"
              @click="emit('trash', item)"
            >
              移到回收站
            </button>
            <!-- 回收站中的彻底删除不可再从界面恢复，会真正从本地会话数据移除。 -->
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
// Close 是 Element Plus 的关闭图标组件，用在归档/回收站弹窗的关闭按钮。
import { Close } from '@element-plus/icons-vue'

// ChatSession 是会话数据的 TS 类型，用于描述每个待管理会话，不是 Vue 组件。
import type { ChatSession } from '@/stores/chat'

export interface ManagedConversation {
  // export 表示其他文件也可以 import 这个类型；它不会生成浏览器运行时代码。
  // 空 projectName 表示普通会话，非空值表示所属项目。
  projectName: string
  session: ChatSession
  timestamp: number
}

defineProps<{
  // items 始终只包含当前 mode 对应的数据。
  archivedCount: number
  items: ManagedConversation[]
  // 字面量联合保证 mode 只有两个合法标签页值。
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
  // 此处格式化逻辑仅服务该弹窗，所以保留为组件内部辅助函数。
  new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
</script>
