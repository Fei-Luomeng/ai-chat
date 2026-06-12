<template>
  <!-- 空会话欢迎页：没有持久化消息时展示。 -->
  <div class="welcome-center">
    <div class="welcome-card">
      <span class="welcome-avatar" :style="avatarImage ? { backgroundImage: `url(${avatarImage})` } : undefined">
        <!-- 有图片时通过行内 style 显示背景；没有图片时才渲染文字头像。 -->
        <template v-if="!avatarImage">{{ savedAvatarDisplay }}</template>
      </span>
      <p v-if="isProjectMode" class="project-kicker">项目：{{ activeProject }}</p>
      <h1>{{ isProjectMode ? '在这个项目中开始对话' : '有什么可以帮忙的？' }}</h1>
      <!-- 模板和输入器复用通用组件，避免欢迎页形成另一套发送逻辑。 -->
      <PromptTemplateBar
        id-prefix="fresh"
        :templates="templates"
        @apply="emit('applyTemplate', $event)"
        @manage="emit('manageTemplates')"
      />
      <ChatComposer
        class="center-composer"
        :agent-mode="agentMode"
        :deep-thinking="deepThinking"
        :draft="draft"
        :is-listening="isListening"
        placeholder="给 AI Chat 发送消息"
        :responding="responding"
        :voice-input-supported="voiceInputSupported"
        :web-search="webSearch"
        @send="emit('send')"
        @stop="emit('stop')"
        @toggle-agent-mode="emit('toggleAgentMode')"
        @toggle-deep-thinking="emit('toggleDeepThinking')"
        @toggle-voice-input="emit('toggleVoiceInput')"
        @toggle-web-search="emit('toggleWebSearch')"
        @update-draft="emit('updateDraft', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// ChatComposer：欢迎页中间的聊天输入框，用户可以直接从这里发送第一条消息。
import ChatComposer from '@/components/chat/ChatComposer.vue'
// PromptTemplateBar：显示可点击的快捷提示词，点击后通知父组件填充输入框。
import PromptTemplateBar from '@/components/chat/PromptTemplateBar.vue'
// PromptTemplate 只导入提示词对象的 TS 类型，供 props 和事件参数检查使用，不是页面组件。
import type { PromptTemplate } from '@/types/ui'

// WelcomeView 是中间展示层：继续把 props 传给 ChatComposer，
// 再把 ChatComposer 的事件原样转发给 App.vue，没有创建第二份草稿或开关状态。
// 所有状态均来自父级，欢迎页自身不保留草稿或工具开关。
defineProps<{
  activeProject: string
  agentMode: boolean
  avatarImage: string
  deepThinking: boolean
  draft: string
  isProjectMode: boolean
  isListening: boolean
  responding: boolean
  savedAvatarDisplay: string
  templates: PromptTemplate[]
  voiceInputSupported: boolean
  webSearch: boolean
}>()

const emit = defineEmits<{
  applyTemplate: [template: PromptTemplate]
  manageTemplates: []
  send: []
  stop: []
  toggleAgentMode: []
  toggleDeepThinking: []
  toggleVoiceInput: []
  toggleWebSearch: []
  updateDraft: [value: string]
}>()
</script>
