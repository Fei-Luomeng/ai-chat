<template>
  <div class="welcome-center">
    <div class="welcome-card">
      <span class="welcome-avatar" :style="avatarImage ? { backgroundImage: `url(${avatarImage})` } : undefined">
        <template v-if="!avatarImage">{{ savedAvatarDisplay }}</template>
      </span>
      <p v-if="isProjectMode" class="project-kicker">项目：{{ activeProject }}</p>
      <h1>{{ isProjectMode ? '在这个项目中开始对话' : '有什么可以帮忙的？' }}</h1>
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
import ChatComposer from '@/components/chat/ChatComposer.vue'
import PromptTemplateBar from '@/components/chat/PromptTemplateBar.vue'
import type { PromptTemplate } from '@/types/ui'

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
