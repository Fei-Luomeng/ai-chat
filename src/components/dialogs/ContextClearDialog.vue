<template>
  <div v-if="open" class="confirm-overlay" @click.self="emit('close')">
    <section class="confirm-dialog" @click.stop>
      <header>
        <h2>清空上下文</h2>
        <button type="button" aria-label="关闭弹窗" @click="emit('close')"><Close :size="18" /></button>
      </header>
      <div class="confirm-body">
        <p>页面里的历史消息会保留，但下一次发送时，模型只会读取清空之后的新消息。</p>
        <strong>{{ title }}</strong>
      </div>
      <footer>
        <button class="cancel-settings" type="button" @click="emit('close')">取消</button>
        <button class="confirm-primary" type="button" @click="emit('confirm')">确认清空</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Close } from '@element-plus/icons-vue'

defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: []; confirm: [] }>()
</script>
