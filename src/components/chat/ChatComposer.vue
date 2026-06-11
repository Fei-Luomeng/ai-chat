<template>
  <!-- 同一输入器复用于欢迎页、普通会话和项目首页。 -->
  <div
    v-bind="$attrs"
    :class="variant === 'project' ? 'project-hero-composer' : 'composer'"
  >
    <!-- Enter 直接发送；多行输入可由输入法或组合键完成。 -->
    <el-input
      :model-value="draft"
      type="textarea"
      :autosize="{ minRows: 1, maxRows: variant === 'project' ? 4 : 5 }"
      resize="none"
      :placeholder="placeholder"
      @update:model-value="emit('updateDraft', String($event))"
      @keydown.enter.exact.prevent="emit('send')"
    />
    <!-- 工具按钮的 aria-pressed 同时服务可访问性和发送参数兼容读取。 -->
    <div class="composer-tools" :class="{ 'project-tools': variant === 'project' }">
      <button
        type="button"
        data-tool="deep-thinking"
        :aria-pressed="deepThinking"
        :class="{ active: deepThinking }"
        @click="emit('toggleDeepThinking')"
      >
        <ChatDotRound :size="16" />
        <span>深度思考</span>
      </button>
      <button
        type="button"
        data-tool="agent-mode"
        :aria-pressed="agentMode"
        :class="{ active: agentMode }"
        @click="emit('toggleAgentMode')"
      >
        <Setting :size="16" />
        <span>Agent 模式</span>
      </button>
      <button
        type="button"
        data-tool="web-search"
        :aria-pressed="webSearch"
        :class="{ active: webSearch }"
        @click="emit('toggleWebSearch')"
      >
        <Search :size="16" />
        <span>联网搜索</span>
      </button>
      <button
        v-if="voiceInputSupported"
        type="button"
        data-tool="voice-input"
        :aria-label="isListening ? '停止语音输入' : '开始语音输入'"
        :aria-pressed="isListening"
        :class="{ active: isListening, listening: isListening }"
        @click="emit('toggleVoiceInput')"
      >
        <Microphone :size="16" />
        <span>{{ isListening ? '正在聆听' : '语音输入' }}</span>
        <i v-if="isListening" class="voice-pulse" />
      </button>
    </div>
    <!-- 项目版和普通版沿用各自视觉体系，但发送/停止事件保持一致。 -->
    <button
      v-if="variant === 'project' && responding"
      type="button"
      class="project-send project-stop"
      @click="emit('stop')"
    >
      <span />
    </button>
    <button
      v-else-if="variant === 'project'"
      type="button"
      class="project-send"
      :disabled="!draft.trim()"
      @click="emit('send')"
    >
      <Promotion :size="22" />
    </button>
    <el-button v-else-if="responding" class="composer-stop" @click="emit('stop')">
      <span />
    </el-button>
    <el-button
      v-else
      type="primary"
      :icon="Promotion"
      :disabled="!draft.trim()"
      circle
      @click="emit('send')"
    />
  </div>
  <p v-if="hint" class="composer-hint">AI 可能会出错，请核对重要信息。</p>
</template>

<script setup lang="ts">
import { ChatDotRound, Microphone, Promotion, Search, Setting } from '@element-plus/icons-vue'

// defineOptions 是 <script setup> 中声明组件选项的方式，可理解为 Vue 2
// export default 对象里 inheritAttrs 等少数组件配置的替代入口。
// 根节点需要接收父组件传入的 class，因此关闭 Vue 默认的 attrs 继承位置。
defineOptions({
  inheritAttrs: false,
})

// defineProps/defineEmits 是编译宏，不需要从 vue 导入。
// withDefaults 为可选 prop 提供默认值，对应 Vue 2 props 中的 default。
withDefaults(
  // variant 只控制布局样式，工具状态仍完全由父组件管理。
  defineProps<{
    agentMode: boolean
    deepThinking: boolean
    draft: string
    hint?: boolean
    placeholder: string
    responding: boolean
    variant?: 'default' | 'project'
    isListening: boolean
    voiceInputSupported: boolean
    webSearch: boolean
  }>(),
  {
    hint: false,
    variant: 'default',
  },
)

const emit = defineEmits<{
  send: []
  stop: []
  toggleAgentMode: []
  toggleDeepThinking: []
  toggleVoiceInput: []
  toggleWebSearch: []
  updateDraft: [value: string]
}>()
// updateDraft 是受控输入事件：父组件收到值后更新自己的 draft。
// 这样子组件不会直接修改 prop，也可以在多个位置复用同一个输入器。
</script>
