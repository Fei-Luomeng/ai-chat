<template>
  <!-- 收藏管理支持关键词和来源范围组合筛选。 -->
  <div v-if="open" class="confirm-overlay" @click.self="emit('close')">
    <section class="favorites-dialog" @click.stop>
      <header>
        <div><p>收藏管理</p><h2>收藏回答</h2></div>
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
          <option v-for="option in scopeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>
      <!-- 打开收藏会先切换到原会话，再定位到对应消息。 -->
      <div class="favorites-manager-list">
        <article v-for="favorite in filteredFavorites" :key="`manage-${favorite.id}`">
          <button class="favorite-open" type="button" @click="emit('openFavorite', favorite)">
            <strong>{{ favorite.title }}</strong>
            <span>{{ favorite.projectName ?? '普通对话' }}</span>
            <p>{{ getPreview(favorite) }}</p>
          </button>
          <button class="favorite-remove" type="button" @click="emit('remove', favorite)">取消收藏</button>
        </article>
        <p v-if="filteredFavorites.length === 0" class="favorites-empty">
          {{ favorites.length ? '没有符合条件的收藏。' : '还没有收藏回答。' }}
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Close, Search } from '@element-plus/icons-vue'

import type { FavoriteResult } from '@/types/ui'

// favorites 用于区分“没有收藏”和“筛选后无结果”两种空状态。
defineProps<{
  favorites: FavoriteResult[]
  filteredFavorites: FavoriteResult[]
  getPreview: (favorite: FavoriteResult) => string
  open: boolean
  scope: string
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
