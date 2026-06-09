<template>
  <div v-if="globalOpen" class="search-overlay" @click.self="emit('closeGlobal')">
    <div class="search-dialog">
      <div class="search-box">
        <Search :size="20" />
        <input
          :value="globalQuery"
          placeholder="搜索对话内容..."
          @input="emit('updateGlobalQuery', ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="globalQuery"
          type="button"
          aria-label="清除搜索"
          @click="emit('updateGlobalQuery', '')"
        >
          <Close :size="18" />
        </button>
        <button v-else type="button" aria-label="关闭搜索" @click="emit('closeGlobal')">
          <Close :size="18" />
        </button>
      </div>
      <div class="search-results" :class="{ idle: !globalQuery.trim() }">
        <p v-if="!globalQuery.trim()" class="search-idle">输入关键词后开始搜索对话</p>
        <button
          v-for="result in globalResults"
          :key="result.id"
          class="search-result"
          type="button"
          @click="emit('selectGlobal', result)"
        >
          <span class="spark" />
          <span class="result-copy">
            <strong>
              <template v-for="(part, index) in highlightParts(result.title, globalQuery)" :key="`${result.id}-title-${index}`">
                <mark v-if="part.hit">{{ part.text }}</mark>
                <span v-else>{{ part.text }}</span>
              </template>
            </strong>
            <em>{{ result.type === 'title' ? '标题命中' : result.role === 'assistant' ? 'AI Chat' : '你' }}</em>
            <small>
              <template v-for="(part, index) in highlightParts(result.preview, globalQuery)" :key="`${result.id}-preview-${index}`">
                <mark v-if="part.hit">{{ part.text }}</mark>
                <span v-else>{{ part.text }}</span>
              </template>
            </small>
          </span>
        </button>
        <p v-if="globalQuery.trim() && globalResults.length === 0" class="empty-search">没有找到相关对话</p>
      </div>
    </div>
  </div>

  <div v-if="sessionOpen" class="search-overlay" @click.self="emit('closeSession')">
    <div class="search-dialog session-search-dialog">
      <div class="search-box">
        <Search :size="20" />
        <input
          :value="sessionQuery"
          placeholder="搜索当前会话..."
          @input="emit('updateSessionQuery', ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="sessionQuery"
          type="button"
          aria-label="清除搜索"
          @click="emit('updateSessionQuery', '')"
        >
          <Close :size="18" />
        </button>
        <button v-else type="button" aria-label="关闭当前会话搜索" @click="emit('closeSession')">
          <Close :size="18" />
        </button>
      </div>
      <div class="search-results" :class="{ idle: !sessionQuery.trim() }">
        <p v-if="!sessionQuery.trim()" class="search-idle">输入关键词后搜索当前会话</p>
        <button
          v-for="result in sessionResults"
          :key="result.id"
          class="search-result"
          type="button"
          @click="emit('selectSession', result)"
        >
          <span class="spark" />
          <span class="result-copy">
            <strong>{{ result.role === 'assistant' ? 'AI Chat' : '你' }} · {{ formatTime(result.createdAt ?? Date.now()) }}</strong>
            <em>当前会话</em>
            <small>
              <template v-for="(part, index) in highlightParts(result.preview, sessionQuery)" :key="`${result.id}-current-preview-${index}`">
                <mark v-if="part.hit">{{ part.text }}</mark>
                <span v-else>{{ part.text }}</span>
              </template>
            </small>
          </span>
        </button>
        <p v-if="sessionQuery.trim() && sessionResults.length === 0" class="empty-search">
          当前会话里没有找到相关消息
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Close, Search } from '@element-plus/icons-vue'

import type { SearchResult } from '@/types/ui'

defineProps<{
  globalOpen: boolean
  globalQuery: string
  globalResults: SearchResult[]
  sessionOpen: boolean
  sessionQuery: string
  sessionResults: SearchResult[]
}>()

const emit = defineEmits<{
  closeGlobal: []
  closeSession: []
  selectGlobal: [result: SearchResult]
  selectSession: [result: SearchResult]
  updateGlobalQuery: [value: string]
  updateSessionQuery: [value: string]
}>()

const highlightParts = (content: string, keyword: string) => {
  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) return [{ text: content, hit: false }]

  const lowerContent = content.toLowerCase()
  const lowerKeyword = normalizedKeyword.toLowerCase()
  const parts: Array<{ text: string; hit: boolean }> = []
  let cursor = 0
  let index = lowerContent.indexOf(lowerKeyword)

  while (index !== -1) {
    if (index > cursor) parts.push({ text: content.slice(cursor, index), hit: false })
    parts.push({ text: content.slice(index, index + normalizedKeyword.length), hit: true })
    cursor = index + normalizedKeyword.length
    index = lowerContent.indexOf(lowerKeyword, cursor)
  }

  if (cursor < content.length) parts.push({ text: content.slice(cursor), hit: false })
  return parts
}

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
</script>
