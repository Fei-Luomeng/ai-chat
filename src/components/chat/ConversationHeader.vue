<template>
  <header class="conversation-header">
    <button
      v-if="sidebarCollapsed"
      class="open-sidebar"
      type="button"
      aria-label="展开侧边栏"
      @click="emit('openSidebar')"
    >
      <component :is="isMobileViewport ? Menu : MoreFilled" :size="18" />
    </button>
    <button class="model-button" type="button">
      <span>{{ isProjectMode ? '项目' : 'AI Chat' }}</span>
      <strong>{{ isProjectMode ? projectName : sessionTitle }}</strong>
    </button>
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
