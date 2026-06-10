<template>
  <!-- 左侧选择已有模板，右侧复用同一表单进行新增和编辑。 -->
  <div v-if="open" class="confirm-overlay" @click.self="emit('close')">
    <section class="template-dialog" @click.stop>
      <header>
        <div><p>提示词模板</p><h2>管理常用模板</h2></div>
        <button type="button" aria-label="关闭模板管理" @click="emit('close')"><Close :size="18" /></button>
      </header>
      <div class="template-body">
        <!-- 模板列表只切换编辑目标，不会立即修改模板内容。 -->
        <div class="template-list">
          <button
            v-for="template in templates"
            :key="`manage-${template.id}`"
            type="button"
            :class="{ active: editingId === template.id }"
            @click="emit('editTemplate', template)"
          >
            <span>{{ template.label }}</span>
            <small>{{ template.prompt }}</small>
          </button>
          <p v-if="templates.length === 0" class="template-empty">还没有模板。</p>
        </div>
        <!-- 表单值由父级草稿维护，保存时再写回模板列表。 -->
        <div class="template-form">
          <label>
            <span>名称</span>
            <input
              :value="draftLabel"
              placeholder="例如：代码审查"
              @input="emit('updateDraftLabel', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label>
            <span>内容</span>
            <textarea
              :value="draftPrompt"
              placeholder="输入插入到对话框里的提示词内容"
              @input="emit('updateDraftPrompt', ($event.target as HTMLTextAreaElement).value)"
            />
          </label>
          <div class="template-form-actions">
            <button type="button" @click="emit('resetDraft')">新建</button>
            <button type="button" class="primary" @click="emit('save')">{{ editingId ? '保存修改' : '新增模板' }}</button>
          </div>
        </div>
      </div>
      <!-- 恢复默认和删除当前模板是列表级操作。 -->
      <footer>
        <button class="cancel-settings" type="button" @click="emit('restoreDefaults')">恢复默认</button>
        <button v-if="editingId" class="confirm-primary danger" type="button" @click="emit('deleteTemplate', editingId)">
          删除当前模板
        </button>
        <button class="confirm-primary" type="button" @click="emit('close')">完成</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Close } from '@element-plus/icons-vue'

import type { PromptTemplate } from '@/types/ui'

// 组件保持无本地表单状态，避免关闭重开后残留旧编辑内容。
defineProps<{
  draftLabel: string
  draftPrompt: string
  editingId: string
  open: boolean
  templates: PromptTemplate[]
}>()

const emit = defineEmits<{
  close: []
  deleteTemplate: [id: string]
  editTemplate: [template: PromptTemplate]
  resetDraft: []
  restoreDefaults: []
  save: []
  updateDraftLabel: [value: string]
  updateDraftPrompt: [value: string]
}>()
</script>
