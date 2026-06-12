<template>
  <!-- 收藏管理支持关键词和来源范围组合筛选。 -->
  <div v-if="open" class="confirm-overlay" @click.self="emit('close')">
    <section class="favorites-dialog" @click.stop>
      <header>
        <div><p>收藏管理</p><h2>收藏回答</h2></div>
        <!-- 关闭按钮：退出收藏管理，不改变当前所在会话。 -->
        <button type="button" aria-label="关闭收藏管理" @click="emit('close')"><Close :size="18" /></button>
      </header>
      <!-- 搜索词与范围均由父级计算 filteredFavorites。 -->
      <div class="favorites-toolbar">
        <label>
          <Search :size="17" />
          <input
            :value="searchText"
            placeholder="搜索收藏内容..."
            @input="emit('updateSearchText', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <select :value="scope" aria-label="筛选收藏范围" @change="emit('updateScope', ($event.target as HTMLSelectElement).value)">
          <!-- option 的 value 是真正提交的筛选值，label 只是用户看到的文字。 -->
          <option v-for="option in scopeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>
      <!-- 打开收藏会先切换到原会话，再定位到对应消息。 -->
      <div class="favorites-manager-list">
        <article v-for="favorite in filteredFavorites" :key="`manage-${favorite.id}`">
          <!-- 收藏内容按钮：打开原会话并滚动到这条被收藏的助手回答。 -->
          <button class="favorite-open" type="button" @click="emit('openFavorite', favorite)">
            <strong>{{ favorite.title }}</strong>
            <!-- projectName 缺失（null/undefined）时，?? 使用“普通对话”作为默认显示文字。 -->
            <span>{{ favorite.projectName ?? '普通对话' }}</span>
            <p>{{ getPreview(favorite) }}</p>
          </button>
          <!-- 取消收藏按钮：从收藏列表移除该回答，但不会删除原会话消息。 -->
          <button class="favorite-remove" type="button" @click="emit('remove', favorite)">取消收藏</button>
        </article>
        <p v-if="filteredFavorites.length === 0" class="favorites-empty">
          <!-- 嵌套三元不复杂时可直接用于文案：有收藏但筛选为空 / 完全没有收藏。 -->
          {{ favorites.length ? '没有符合条件的收藏。' : '还没有收藏回答。' }}
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
// Close 用于关闭收藏弹窗；Search 用于搜索框和搜索提示，两者都是图标组件。
import { Close, Search } from '@element-plus/icons-vue'

// FavoriteResult 是收藏结果的数据类型，用于检查列表、预览函数和事件参数。
import type { FavoriteResult } from '@/types/ui'

// favorites 是全部收藏，filteredFavorites 是父组件根据关键词和范围计算后的结果。
// 两份数组看似重复，但用途不同：前者判断原始数据是否为空，后者负责实际列表渲染。
// favorites 用于区分“没有收藏”和“筛选后无结果”两种空状态。
defineProps<{
  favorites: FavoriteResult[]
  filteredFavorites: FavoriteResult[]
  getPreview: (favorite: FavoriteResult) => string
  open: boolean
  scope: string
  // scopeOptions 每项都包含展示文字 label 和真实筛选值 value。
  scopeOptions: Array<{ label: string; value: string }>
  searchText: string
}>()

const emit = defineEmits<{
  close: []
  openFavorite: [favorite: FavoriteResult]
  remove: [favorite: FavoriteResult]
  updateScope: [value: string]
  updateSearchText: [value: string]
}>()
</script>
