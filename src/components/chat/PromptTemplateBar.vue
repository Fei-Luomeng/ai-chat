<template>
  <!-- 模板条只负责把选中的模板上抛，不直接修改输入框。 -->
  <div class="prompt-templates" aria-label="提示词模板">
    <button
      v-for="template in templates"
      :key="`${idPrefix}-${template.id}`"
      type="button"
      @click="emit('apply', template)"
    >
      <EditPen :size="14" />
      <span>{{ template.label }}</span>
    </button>
    <button class="manage-template-button" type="button" @click="emit('manage')">
      <Setting :size="14" />
      <span>管理模板</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { EditPen, Setting } from '@element-plus/icons-vue'

import type { PromptTemplate } from '@/types/ui'

// idPrefix 保证同一页面存在多个模板条时 key 仍然清晰稳定。
defineProps<{
  idPrefix: string
  templates: PromptTemplate[]
}>()

const emit = defineEmits<{
  apply: [template: PromptTemplate]
  manage: []
}>()
</script>
