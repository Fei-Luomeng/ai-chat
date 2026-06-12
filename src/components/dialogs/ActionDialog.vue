<template>
  <!-- 项目和会话的通用创建、重命名、删除确认框。 -->
  <div v-if="dialog" class="confirm-overlay" @click="emit('close')">
    <!-- 点击遮罩关闭；点击内容区使用 .stop 阻止事件冒泡到遮罩。 -->
    <section class="confirm-dialog" @click.stop>
      <header>
        <h2>{{ getTitle(dialog) }}</h2>
        <!-- 关闭按钮：取消当前创建、重命名或删除操作，不提交任何修改。 -->
        <button type="button" aria-label="关闭弹窗" @click="emit('close')"><Close :size="18" /></button>
      </header>
      <!-- 创建/重命名使用输入框，删除操作展示影响说明。 -->
      <div class="confirm-body">
        <!-- startsWith('rename') 同时覆盖 rename-project 和 rename-session。 -->
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
      <!-- 危险操作通过 type 切换文案和视觉状态。 -->
      <footer>
        <!-- 取消直接关闭；右侧确认按钮根据 dialog.type 执行保存、移入回收站或删除项目。 -->
        <button class="cancel-settings" type="button" @click="emit('close')">取消</button>
        <button class="confirm-primary" :class="{ danger: dialog.type.startsWith('delete') }" type="button" @click="emit('confirm')">
          {{ dialog.type === 'create-project' || dialog.type.startsWith('rename') ? '保存' : dialog.type === 'delete-session' ? '移到回收站' : '删除' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
// Close 是 Element Plus 的关闭图标组件，用在弹窗右上角关闭按钮。
import { Close } from '@element-plus/icons-vue'

// ActionDialogState 是弹窗状态的 TS 类型，描述创建、重命名、删除操作需要哪些字段。
import type { ActionDialogState } from '@/types/ui'

// ActionDialogState 是判别联合类型，dialog.type 是判别字段。
// 判断 type 后，TypeScript 会自动知道当前分支还具备哪些字段。
// dialog 为 null 时组件完全不渲染，输入值由父级状态持有。
// `defineProps<类型>()` 尖括号中放的是 TS 类型参数，不是传给函数的运行时参数。
// `ActionDialogState | null` 表示父组件既可以传弹窗对象，也可以传 null 表示未打开。
defineProps<{ dialog: ActionDialogState | null }>()
// defineEmits 中键名是事件名，右侧元组是事件参数：
// close: [] 表示没有参数；updateValue: [value: string] 表示必须传一个字符串。
const emit = defineEmits<{ close: []; confirm: []; updateValue: [value: string] }>()

// 参数 `(dialog: ActionDialogState)` 约束传入对象，返回值没有标注，
// TS 会根据每个三元分支都返回字符串而自动推断为 string。
const getTitle = (dialog: ActionDialogState) =>
  // 连续三元按顺序判断操作类型，最终保证每种联合成员都有对应标题。
  dialog.type === 'create-project'
    ? '新项目'
    : dialog.type.startsWith('rename')
      ? '重命名'
      : dialog.type === 'delete-session'
        ? '确认删除对话'
        : '确认删除项目'
</script>
