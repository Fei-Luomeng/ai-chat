<template>
  <!-- 清空上下文不会删除消息，只改变下一次请求的上下文起点。 -->
  <!--
    v-if="open" 表示只有父组件传入 open=true 时才创建整棵弹窗 DOM。
    关闭后节点会被销毁，而不是仅仅通过 CSS 隐藏。
  -->
  <div v-if="open" class="confirm-overlay" @click.self="emit('close')">
    <!--
      .self 表示只有点击事件的 target 正好是遮罩本身时才关闭。
      点击遮罩内的 section 时 target 不是遮罩，因此不会误关闭。
    -->
    <section class="confirm-dialog" @click.stop>
      <header>
        <h2>清空上下文</h2>
        <!-- 关闭按钮：退出弹窗，不改变当前会话的上下文起点。 -->
        <button type="button" aria-label="关闭弹窗" @click="emit('close')"><Close :size="18" /></button>
      </header>
      <div class="confirm-body">
        <p>页面里的历史消息会保留，但下一次发送时，模型只会读取清空之后的新消息。</p>
        <strong>{{ title }}</strong>
      </div>
      <footer>
        <!-- 取消不做修改；确认清空只影响以后发送给模型的历史范围，不删除页面消息。 -->
        <button class="cancel-settings" type="button" @click="emit('close')">取消</button>
        <button class="confirm-primary" type="button" @click="emit('confirm')">确认清空</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
// Close 是 Element Plus 的关闭图标组件，用在弹窗右上角关闭按钮。
import { Close } from '@element-plus/icons-vue'

// 这是纯展示弹窗：open/title 从父组件读取，点击操作通过 emit 通知父组件。
// 组件本身不知道 activeSession，也不负责修改时间戳或 localStorage。
// 具体时间戳更新和持久化由父级确认事件处理。
defineProps<{ open: boolean; title: string }>()
// close 和 confirm 都不携带参数，所以事件参数类型写成空元组 []。
const emit = defineEmits<{ close: []; confirm: [] }>()
</script>
