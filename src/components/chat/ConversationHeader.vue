<template>
  <!-- 会话顶栏：导航入口、当前位置和会话级操作。 -->
  <header class="conversation-header">
    <!-- 展开侧栏按钮：仅在侧栏已收起时显示，移动端使用菜单图标。 -->
    <button
      v-if="sidebarCollapsed"
      class="open-sidebar"
      type="button"
      aria-label="展开侧边栏"
      @click="emit('openSidebar')"
    >
      <component :is="isMobileViewport ? Menu : MoreFilled" :size="18" />
    </button>
    <!-- 标题按钮：当前只展示“模式 + 项目名/会话名”，没有绑定点击操作。 -->
    <button class="model-button" type="button">
      <span>{{ isProjectMode ? '项目' : 'AI Chat' }}</span>
      <strong>{{ isProjectMode ? projectName : sessionTitle }}</strong>
    </button>
    <!-- 查当前按钮：打开会话内搜索；没有消息时禁用，因为没有可搜索内容。 -->
    <button
      class="header-session-search"
      type="button"
      :disabled="!hasMessages"
      @click="emit('openSessionSearch')"
    >
      查当前
    </button>
    <!--
      清上下文按钮：让下一次请求不再携带此前消息，但页面历史仍然保留；
      AI 正在生成时禁用，避免请求过程中改变上下文边界。
    -->
    <button
      class="header-context"
      :class="{ active: contextCleared }"
      type="button"
      :disabled="isResponding"
      @click="emit('clearContext')"
    >
      {{ contextCleared ? '已清上下文' : '清上下文' }}
    </button>
    <!-- 导入按钮：主动点击隐藏的文件 input，打开系统文件选择框以导入 Markdown 对话。 -->
    <button class="header-export" type="button" @click="importInputRef?.click()">导入</button>
    <!-- 隐藏文件输入：用户选中文件后把 change 事件交给父组件解析，不是可见按钮。 -->
    <input
      ref="importInputRef"
      class="hidden-file-input"
      type="file"
      accept=".md,text/markdown,text/plain"
      @change="emit('importSession', $event)"
    />
    <!-- 导出按钮：打开导出弹窗；没有消息时禁用。 -->
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
// Menu：移动端展开左侧栏的按钮图标；MoreFilled：顶部“更多操作”菜单图标。
import { Menu, MoreFilled } from '@element-plus/icons-vue'
// ref 是 Vue 响应式 API，这里用于保存隐藏的文件选择 input DOM 元素。
import { ref } from 'vue'

// 顶栏只知道“是否有消息、是否生成中、当前标题”等展示信息，
// 不接收整个 ChatSession，减少组件与会话数据结构的耦合。
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

// 泛型参数指定 ref 将保存 input DOM；挂载前没有元素，因此还要包含 null。
// 模板中的 importInputRef?.click() 使用可选链，只在元素已经挂载后触发文件选择。
const importInputRef = ref<HTMLInputElement | null>(null)
</script>
