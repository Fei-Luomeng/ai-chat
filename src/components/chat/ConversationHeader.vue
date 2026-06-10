<template>
  <!-- 会话顶栏：导航入口、当前位置和会话级操作。 -->
  <header class="conversation-header">
    <!-- 侧边栏收起后才显示恢复入口，移动端使用菜单图标。 -->
    <button
      v-if="sidebarCollapsed"
      class="open-sidebar"
      type="button"
      aria-label="展开侧边栏"
      @click="emit('openSidebar')"
    >
      <component :is="isMobileViewport ? Menu : MoreFilled" :size="18" />
    </button>
    <!-- 项目模式显示项目名，普通模式显示当前会话标题。 -->
    <button class="model-button" type="button">
      <span>{{ isProjectMode ? '项目' : 'AI Chat' }}</span>
      <strong>{{ isProjectMode ? projectName : sessionTitle }}</strong>
    </button>
    <!-- 搜索和导出依赖已有消息；上下文清理在生成期间禁用。 -->
    <button
      class="header-session-search"
      type="button"
      :disabled="!hasMessages"
      @click="emit('openSessionSearch')"
    >
      查当前
    </button>
    <button
      class="header-context"
      :class="{ active: contextCleared }"
      type="button"
      :disabled="isResponding"
      @click="emit('clearContext')"
    >
      {{ contextCleared ? '已清上下文' : '清上下文' }}
    </button>
    <button class="header-export" type="button" @click="importInputRef?.click()">导入</button>
    <!-- 原生文件输入隐藏，由可样式化按钮触发。 -->
    <input
      ref="importInputRef"
      class="hidden-file-input"
      type="file"
      accept=".md,text/markdown,text/plain"
      @change="emit('importSession', $event)"
    />
    <button
      class="header-export"
      type="button"
      :disabled="!hasMessages"
      @click="emit('openExport')"
    >
      导出
    </button>
  </header>
</template>

<script setup lang="ts">
import { Menu, MoreFilled } from '@element-plus/icons-vue'
import { ref } from 'vue'

// 顶栏不直接操作会话，只向父级发出会话级命令。
defineProps<{
  contextCleared: boolean
  hasMessages: boolean
  isMobileViewport: boolean
  isProjectMode: boolean
  isResponding: boolean
  projectName: string
  sessionTitle: string
  sidebarCollapsed: boolean
}>()

const emit = defineEmits<{
  clearContext: []
  importSession: [event: Event]
  openExport: []
  openSessionSearch: []
  openSidebar: []
}>()

const importInputRef = ref<HTMLInputElement | null>(null)
</script>
