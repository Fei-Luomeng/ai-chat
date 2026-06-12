<template>
  <!-- 模板条只负责把选中的模板上抛，不直接修改输入框。 -->
  <div class="prompt-templates" aria-label="提示词模板">
    <!-- idPrefix 区分同一模板在欢迎页、项目页、底部输入区等多个实例中的 key。 -->
    <!-- 模板按钮：把该模板的完整 prompt 填入聊天输入框，不会立即自动发送。 -->
    <button
      v-for="template in templates"
      :key="`${idPrefix}-${template.id}`"
      type="button"
      @click="emit('apply', template)"
    >
      <EditPen :size="14" />
      <span>{{ template.label }}</span>
    </button>
    <!-- 管理模板按钮：打开模板管理弹窗，可新增、编辑、删除或恢复默认模板。 -->
    <button class="manage-template-button" type="button" @click="emit('manage')">
      <Setting :size="14" />
      <span>管理模板</span>
    </button>
  </div>
</template>

<script setup lang="ts">
// EditPen 用在单个提示词模板按钮；Setting 用在“管理模板”入口。
import { EditPen, Setting } from '@element-plus/icons-vue'

// PromptTemplate 是提示词模板的数据类型，用于检查模板数组和 apply 事件参数。
import type { PromptTemplate } from '@/types/ui'

// 这是一个“无状态转发组件”：它不保存选中模板，也不直接修改 draft。
// 用户点击后把完整 template 对象发给父级，由 usePromptTemplates 决定如何插入输入框。
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
