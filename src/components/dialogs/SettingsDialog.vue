<template>
  <!-- 设置弹窗编辑的是草稿副本，只有保存后才更新应用状态。 -->
  <div v-if="open" class="settings-overlay" @click="emit('close')">
    <section class="settings-dialog" @click.stop>
      <header>
        <div><p>个人设置</p><h2>账户与外观</h2></div>
        <button type="button" aria-label="关闭设置" @click="emit('close')"><Close :size="18" /></button>
      </header>
      <div class="settings-body">
        <!-- 账户和外观设置。 -->
        <div class="avatar-setting">
          <span class="profile-avatar large" :style="avatarImage ? { backgroundImage: `url(${avatarImage})` } : undefined">
            <template v-if="!avatarImage">{{ avatarText }}</template>
          </span>
          <label class="upload-button">
            <Plus :size="15" /><span>上传头像</span>
            <input type="file" accept="image/*" @change="emit('avatarUpload', $event)" />
          </label>
        </div>
        <label>
          <span>用户名</span>
          <input :value="profileName" placeholder="输入用户名" @input="emit('updateProfileName', ($event.target as HTMLInputElement).value)" />
        </label>
        <div class="theme-switch">
          <button type="button" :class="{ active: themeMode === 'light' }" @click="emit('updateThemeMode', 'light')">
            <Sunny :size="15" /><span>白色</span>
          </button>
          <button type="button" :class="{ active: themeMode === 'dark' }" @click="emit('updateThemeMode', 'dark')">
            <Moon :size="15" /><span>黑色</span>
          </button>
        </div>
        <!-- 模型参数和新会话默认工具状态。 -->
        <section class="model-settings-panel">
          <h3>AI 参数</h3>
          <label>
            <span>temperature</span>
            <input
              :value="modelSettings.temperature"
              type="number"
              min="0"
              max="2"
              step="0.1"
              @input="updateModel(modelSettings, 'temperature', Number(($event.target as HTMLInputElement).value))"
            />
          </label>
          <label>
            <span>max_tokens</span>
            <input
              :value="modelSettings.maxTokens"
              type="number"
              min="0"
              max="8192"
              step="256"
              placeholder="0 表示自适应"
              @input="updateModel(modelSettings, 'maxTokens', Number(($event.target as HTMLInputElement).value))"
            />
          </label>
          <div class="default-tools">
            <label v-for="item in [
              ['defaultDeepThinking', '新对话默认深度思考'],
              ['defaultWebSearch', '新对话默认联网搜索'],
              ['defaultAgentMode', '新对话默认 Agent 模式'],
            ]" :key="item[0]">
              <input
                :checked="Boolean(modelSettings[item[0] as keyof ModelSettings])"
                type="checkbox"
                @change="updateModel(modelSettings, item[0] as keyof ModelSettings, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ item[1] }}</span>
            </label>
          </div>
        </section>
        <!-- 自定义指令和记忆会拼接进系统提示词。 -->
        <section class="personalization-panel">
          <h3>个性化</h3>
          <label>
            <span>自定义指令</span>
            <textarea
              :value="customInstructions"
              placeholder="例如：回答简洁一些，代码示例优先使用 TypeScript。"
              @input="emit('updateCustomInstructions', ($event.target as HTMLTextAreaElement).value)"
            />
          </label>
          <div class="memory-setting">
            <div class="memory-heading">
              <span>记忆</span>
              <small>保存在当前浏览器</small>
            </div>
            <div class="memory-input">
              <input
                :value="draftMemory"
                placeholder="例如：我是一名前端开发者"
                @input="emit('updateDraftMemory', ($event.target as HTMLInputElement).value)"
                @keydown.enter.prevent="emit('addMemory')"
              />
              <button type="button" :disabled="!draftMemory.trim()" @click="emit('addMemory')">
                <Plus :size="15" />
                <span>添加</span>
              </button>
            </div>
            <!-- 记忆仅保存在当前浏览器的 localStorage。 -->
            <div v-if="memories.length" class="memory-list">
              <div v-for="memory in memories" :key="memory.id" class="memory-item">
                <span>{{ memory.content }}</span>
                <button type="button" aria-label="删除记忆" @click="emit('removeMemory', memory.id)">
                  <Close :size="14" />
                </button>
              </div>
            </div>
            <p v-else class="memory-empty">暂无记忆</p>
          </div>
        </section>
      </div>
      <footer>
        <button class="cancel-settings" type="button" @click="emit('close')">取消</button>
        <button class="save-settings" type="button" @click="emit('save')">保存设置</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Close, Moon, Plus, Sunny } from '@element-plus/icons-vue'

import type { MemoryItem, ModelSettings } from '@/types/ui'

// defineProps 返回只读数据；和 Vue 2 一样，子组件不应该直接修改 prop。
// 所有字段都是受控值，关闭弹窗时父级会丢弃未保存草稿。
defineProps<{
  avatarImage: string
  avatarText: string
  customInstructions: string
  draftMemory: string
  memories: MemoryItem[]
  modelSettings: ModelSettings
  open: boolean
  profileName: string
  themeMode: 'light' | 'dark'
}>()

const emit = defineEmits<{
  addMemory: []
  avatarUpload: [event: Event]
  close: []
  removeMemory: [memoryId: string]
  save: []
  updateModelSettings: [value: ModelSettings]
  updateCustomInstructions: [value: string]
  updateDraftMemory: [value: string]
  updateProfileName: [value: string]
  updateThemeMode: [value: 'light' | 'dark']
}>()
// 事件参数用元组写法声明，例如 [value: string] 表示该事件接收一个字符串。
// TypeScript 会检查模板和脚本中 emit 的事件名、参数数量及参数类型。

const updateModel = (settings: ModelSettings, key: keyof ModelSettings, value: boolean | number) => {
  // 通过新对象更新，确保父级 ref 能稳定触发响应式更新。
  emit('updateModelSettings', { ...settings, [key]: value })
}
</script>
