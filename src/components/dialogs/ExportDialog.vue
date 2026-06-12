<template>
  <!-- 对话导出支持全部消息或手动选择消息。 -->
  <div v-if="open" class="confirm-overlay" @click.self="emit('close')">
    <section class="export-dialog" @click.stop>
      <header>
        <div><p>导出对话</p><h2>{{ title }}</h2></div>
        <!-- 关闭按钮：取消本次导出并关闭弹窗，不会创建文件。 -->
        <button type="button" aria-label="关闭导出" @click="emit('close')"><Close :size="18" /></button>
      </header>
      <!-- selectedIds 始终由父级维护，组件只负责选择交互。 -->
      <div class="export-body">
        <div class="export-mode">
          <!-- :class 对象中值为 true 的键才会成为最终 class。 -->
          <!-- 全部导出包含整条会话；选择消息允许在下面手动勾选部分消息。 -->
          <button type="button" :class="{ active: mode === 'all' }" @click="emit('updateMode', 'all')">全部导出</button>
          <button type="button" :class="{ active: mode === 'selected' }" @click="emit('updateMode', 'selected')">选择消息</button>
        </div>
        <p class="export-summary">
          {{ mode === 'all' ? `将导出全部 ${messages.length} 条消息。` : `将导出已选择的 ${selectedTotal} 条消息。` }}
        </p>
        <!-- 仅在选择模式下渲染消息清单，避免全部导出时产生冗余内容。 -->
        <div v-if="mode === 'selected'" class="export-message-list">
          <!-- includes 判断当前消息 id 是否存在于已选择 id 数组中。 -->
          <!-- 消息条目按钮：在导出选择中切换这一条消息的选中/取消状态。 -->
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
        <!-- 取消不创建文件；确认导出会根据当前模式生成并下载 Markdown 文件。 -->
        <button class="cancel-settings" type="button" @click="emit('close')">取消</button>
        <button class="confirm-primary" type="button" @click="emit('confirm')">确认导出</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
// Close 是 Element Plus 的关闭图标组件，用在导出弹窗右上角。
import { Close } from '@element-plus/icons-vue'

// ChatMessage 是消息对象的 TS 类型，用于检查待导出消息列表和预览函数参数。
import type { ChatMessage } from '@/stores/chat'

// 父组件把数据和 getPreview 函数一起传入。
// Vue 的 prop 不只能传字符串/数组，也可以传函数供子组件调用。
// getPreview 复用应用层的纯文本提取，保证思考内容不会混入导出摘要。
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
  // updateMode 携带的新值被限制为 'all' 或 'selected'，其他字符串会触发类型错误。
  close: []
  confirm: []
  toggleMessage: [id: string]
  updateMode: [mode: 'all' | 'selected']
}>()

const formatTime = (timestamp: number) =>
  // timestamp 是毫秒时间戳；Intl 根据中文地区规则输出两位小时和分钟。
  new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(timestamp)
</script>
