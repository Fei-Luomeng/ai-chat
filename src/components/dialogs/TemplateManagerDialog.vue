<template>
  <!-- 左侧选择已有模板，右侧复用同一表单进行新增和编辑。 -->
  <div v-if="open" class="confirm-overlay" @click.self="emit('close')">
    <section class="template-dialog" @click.stop>
      <header>
        <div><p>提示词模板</p><h2>管理常用模板</h2></div>
        <!-- 关闭按钮：退出模板管理；已通过保存按钮提交的修改不会被撤销。 -->
        <button type="button" aria-label="关闭模板管理" @click="emit('close')"><Close :size="18" /></button>
      </header>
      <div class="template-body">
        <!-- 模板列表只切换编辑目标，不会立即修改模板内容。 -->
        <div class="template-list">
          <!-- 模板条目按钮：把该模板载入右侧表单；不会立即修改或应用到聊天输入框。 -->
          <!-- editingId 与当前模板 id 相等时，说明右侧表单正在编辑这一项。 -->
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
            <!-- 新建按钮：清空表单和 editingId，切换到新增模板模式。 -->
            <button type="button" @click="emit('resetDraft')">新建</button>
            <!-- 空字符串是假值，因此 editingId 为空代表新增模式，有值代表编辑模式。 -->
            <!-- 保存按钮：编辑模式覆盖当前模板，新增模式向模板列表追加一项。 -->
            <button type="button" class="primary" @click="emit('save')">{{ editingId ? '保存修改' : '新增模板' }}</button>
          </div>
        </div>
      </div>
      <!-- 恢复默认和删除当前模板是列表级操作。 -->
      <footer>
        <!-- 恢复默认会用系统预设替换模板列表；删除按钮只在编辑已有模板时显示。 -->
        <button class="cancel-settings" type="button" @click="emit('restoreDefaults')">恢复默认</button>
        <button v-if="editingId" class="confirm-primary danger" type="button" @click="emit('deleteTemplate', editingId)">
          删除当前模板
        </button>
        <!-- 完成按钮只关闭弹窗，不会额外自动保存右侧尚未提交的草稿。 -->
        <button class="confirm-primary" type="button" @click="emit('close')">完成</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
// Close 是 Element Plus 的关闭图标组件，用在模板管理弹窗右上角。
import { Close } from '@element-plus/icons-vue'

// PromptTemplate 是提示词模板的数据类型，用于检查模板列表和编辑事件参数。
import type { PromptTemplate } from '@/types/ui'

// draftLabel/draftPrompt 不是组件自己的 ref，而是父组件管理的表单草稿。
// 输入时通过 updateDraft* 事件把新值交还父组件，保存和删除也由父组件执行。
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
