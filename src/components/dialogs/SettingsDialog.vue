<template>
  <!-- 设置弹窗编辑的是草稿副本，只有保存后才更新应用状态。 -->
  <div v-if="open" class="settings-overlay" @click="emit('close')">
    <!-- 内层 .stop 阻止点击事件冒泡到遮罩，否则操作表单时弹窗也会关闭。 -->
    <section class="settings-dialog" @click.stop>
      <header>
        <div><p>个人设置</p><h2>账户与外观</h2></div>
        <!-- 关闭按钮：放弃本次尚未保存的设置草稿，并关闭弹窗。 -->
        <button type="button" aria-label="关闭设置" @click="emit('close')"><Close :size="18" /></button>
      </header>
      <div class="settings-body">
        <!-- 账户和外观设置。 -->
        <div class="avatar-setting">
          <span class="profile-avatar large" :style="avatarImage ? { backgroundImage: `url(${avatarImage})` } : undefined">
            <template v-if="!avatarImage">{{ avatarText }}</template>
          </span>
          <label class="upload-button">
            <!-- 上传头像入口：点击文字区域会触发下面隐藏的文件选择框。 -->
            <Plus :size="15" /><span>上传头像</span>
            <!-- 选择图片后只更新头像草稿，仍需点击“保存设置”才正式保存。 -->
            <input type="file" accept="image/*" @change="emit('avatarUpload', $event)" />
          </label>
        </div>
        <label>
          <span>用户名</span>
          <input :value="profileName" placeholder="输入用户名" @input="emit('updateProfileName', ($event.target as HTMLInputElement).value)" />
        </label>
        <div class="theme-switch">
          <!-- 白色/黑色按钮只切换主题草稿，active class 标记当前选中的主题。 -->
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
            <!-- 原生 number input 的 value 仍是字符串，必须 Number(...) 后再写回设置。 -->
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
            <!--
              这里用二维数组描述“字段名 + 展示文案”，减少三个几乎相同的 checkbox。
              item[0] 是 ModelSettings 字段名，item[1] 是用户看到的文字。
            -->
            <label v-for="item in [
              ['defaultDeepThinking', '新对话默认深度思考'],
              ['defaultWebSearch', '新对话默认联网搜索'],
              ['defaultAgentMode', '新对话默认 Agent 模式'],
            ]" :key="item[0]">
              <!-- 动态索引前把 item[0] 断言为 keyof ModelSettings，确保它是合法字段名。 -->
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
              <!-- 添加按钮：把输入内容加入记忆草稿；空内容时 disabled 禁止点击。 -->
              <button type="button" :disabled="!draftMemory.trim()" @click="emit('addMemory')">
                <Plus :size="15" />
                <span>添加</span>
              </button>
            </div>
            <!-- 记忆仅保存在当前浏览器的 localStorage。 -->
            <div v-if="memories.length" class="memory-list">
              <div v-for="memory in memories" :key="memory.id" class="memory-item">
                <span>{{ memory.content }}</span>
                <!-- 删除记忆按钮：只从当前设置草稿移除，保存后才影响实际记忆。 -->
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
        <!-- 取消丢弃全部草稿；保存设置则校验数据并写入真实应用状态。 -->
        <button class="cancel-settings" type="button" @click="emit('close')">取消</button>
        <button class="save-settings" type="button" @click="emit('save')">保存设置</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
// 以下均为 Element Plus 图标组件：
// Close 用于关闭弹窗，Moon/Sunny 用于深色和浅色主题，Plus 用于上传头像及添加记忆。
import { Close, Moon, Plus, Sunny } from '@element-plus/icons-vue'

// MemoryItem/ModelSettings 是记忆项和模型设置的数据类型，只用于 TS 检查，不是组件。
import type { MemoryItem, ModelSettings } from '@/types/ui'

// SettingsDialog 不保存真实设置，只展示父级传入的“设置草稿”。
// 所有输入变化都创建事件交给父级，所以点击取消时可以整体放弃草稿。
// defineProps 返回只读数据；和 Vue 2 一样，子组件不应该直接修改 prop。
// 所有字段都是受控值，关闭弹窗时父级会丢弃未保存草稿。
// 这里直接在尖括号内写对象类型，适合只被当前组件使用的 props；
// 如果多个文件都需要同一结构，再把它提取成 interface/type 并 export。
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
// 元组中的 value、memoryId 只是帮助阅读和编辑器提示的参数名，真正传递的仍是普通值。
// TypeScript 会检查模板和脚本中 emit 的事件名、参数数量及参数类型。

const updateModel = (settings: ModelSettings, key: keyof ModelSettings, value: boolean | number) => {
  // keyof ModelSettings 会得到所有字段名组成的联合类型，
  // 因此 key 只能是 temperature、maxTokens、defaultAgentMode 等真实字段。
  // boolean | number 表示 value 可以是布尔值或数字；函数内部只能使用两种类型都支持的操作，
  // 若要调用某一种类型特有的方法，需要先用 typeof value 判断并完成类型收窄。
  // [key] 是动态属性名，用同一个函数更新不同设置项。
  // 通过新对象更新，确保父级 ref 能稳定触发响应式更新。
  emit('updateModelSettings', { ...settings, [key]: value })
}
</script>
