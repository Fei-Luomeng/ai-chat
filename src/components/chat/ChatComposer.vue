<template>
  <!-- 同一输入器复用于欢迎页、普通会话和项目首页。 -->
  <div
    v-bind="$attrs"
    :class="variant === 'project' ? 'project-hero-composer' : 'composer'"
  >
    <!--
      v-bind="$attrs" 把父组件传入、但没有声明为 prop 的属性转发到这个 div。
      本项目主要用它转发 class="center-composer"；inheritAttrs:false 防止属性自动落错位置。
    -->
    <!-- Enter 直接发送；多行输入可由输入法或组合键完成。 -->
    <!--
      .exact 表示只能按 Enter，不能同时带 Ctrl/Shift 等修饰键；
      .prevent 等价于 preventDefault，阻止 textarea 插入换行后再触发发送。
    -->
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
      <!-- 深度思考：切换后要求模型进行更充分的分析，并允许使用更高输出上限。 -->
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
      <!-- Agent 模式：允许模型按需调用项目提供的工具，再根据工具结果回答。 -->
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
      <!-- 联网搜索：发送时允许请求网络搜索，回答中可以带网页来源引用。 -->
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
      <!-- 语音输入：开始/停止麦克风识别，把识别文字实时写入输入框。 -->
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
    <!-- 项目生成中显示停止按钮：点击后中止当前项目会话的请求。 -->
    <!-- 项目版和普通版沿用各自视觉体系，但发送/停止事件保持一致。 -->
    <!-- v-if/v-else-if/v-else 保证项目发送、项目停止、普通停止、普通发送只出现一个。 -->
    <button
      v-if="variant === 'project' && responding"
      type="button"
      class="project-send project-stop"
      @click="emit('stop')"
    >
      <span />
    </button>
    <!-- 项目发送按钮：草稿为空时禁用；点击后创建或继续项目会话并发送内容。 -->
    <button
      v-else-if="variant === 'project'"
      type="button"
      class="project-send"
      :disabled="!draft.trim()"
      @click="emit('send')"
    >
      <Promotion :size="22" />
    </button>
    <!-- 普通会话生成中显示停止按钮，点击后取消当前 AI 请求。 -->
    <el-button v-else-if="responding" class="composer-stop" @click="emit('stop')">
      <span />
    </el-button>
    <!-- 普通发送按钮：草稿非空时可用，把当前输入内容发送给 AI。 -->
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
// 以下均为 Element Plus 图标组件：
// ChatDotRound 用于深度思考，Microphone 用于语音输入，Search 用于联网搜索，
// Setting 用于 Agent 模式，Promotion 用于发送按钮；它们只负责显示图标。
import { ChatDotRound, Microphone, Promotion, Search, Setting } from '@element-plus/icons-vue'

// defineOptions 是 <script setup> 中声明组件选项的方式，可理解为 Vue 2
// export default 对象里 inheritAttrs 等少数组件配置的替代入口。
// 根节点需要接收父组件传入的 class，因此关闭 Vue 默认的 attrs 继承位置。
defineOptions({
  inheritAttrs: false,
})

// defineProps/defineEmits 是编译宏，不需要从 vue 导入。
// withDefaults 为可选 prop 提供默认值，对应 Vue 2 props 中的 default。
// `script setup lang="ts"` 开启 TypeScript；这些类型会被 Vue 编译器用于生成检查信息，
// 最终浏览器收到的 JavaScript 中不会保留 interface、泛型等 TS 类型语法。
withDefaults(
  // variant 只控制布局样式，工具状态仍完全由父组件管理。
  // 泛型对象定义所有 prop 的类型；带 ? 的 hint/variant 是可选 prop。
  // 可选不是指值可以随便传，而是父组件可以完全不写这个 prop；写了仍必须符合对应类型。
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
