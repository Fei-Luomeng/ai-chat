<template>
  <div v-if="dialog" class="confirm-overlay" @click="emit('close')">
    <section class="confirm-dialog" @click.stop>
      <header>
        <h2>{{ getTitle(dialog) }}</h2>
        <button type="button" aria-label="关闭弹窗" @click="emit('close')"><Close :size="18" /></button>
      </header>
      <div class="confirm-body">
        <label v-if="dialog.type === 'create-project' || dialog.type.startsWith('rename')">
          <span>{{ dialog.type === 'create-project' ? '项目名称' : '名称' }}</span>
          <input
            :value="dialog.value"
            :placeholder="dialog.type === 'create-project' ? '输入新项目名称' : ''"
            @input="emit('updateValue', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <template v-else>
          <p>{{ dialog.type === 'delete-session' ? '这条对话会移到回收站，之后可以恢复或彻底删除。' : '删除后，这个项目和项目里的对话会从当前列表移除。' }}</p>
          <strong>{{ dialog.value }}</strong>
        </template>
      </div>
      <footer>
        <button class="cancel-settings" type="button" @click="emit('close')">取消</button>
        <button class="confirm-primary" :class="{ danger: dialog.type.startsWith('delete') }" type="button" @click="emit('confirm')">
          {{ dialog.type === 'create-project' || dialog.type.startsWith('rename') ? '保存' : dialog.type === 'delete-session' ? '移到回收站' : '删除' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Close } from '@element-plus/icons-vue'

import type { ActionDialogState } from '@/types/ui'

defineProps<{ dialog: ActionDialogState | null }>()
const emit = defineEmits<{ close: []; confirm: []; updateValue: [value: string] }>()

const getTitle = (dialog: ActionDialogState) =>
  dialog.type === 'create-project'
    ? '新项目'
    : dialog.type.startsWith('rename')
      ? '重命名'
      : dialog.type === 'delete-session'
        ? '确认删除对话'
        : '确认删除项目'
</script>
