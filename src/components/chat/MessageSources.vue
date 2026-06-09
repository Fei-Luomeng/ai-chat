<template>
  <section class="message-sources" aria-label="回答来源">
    <header>
      <strong>来源</strong>
      <span>{{ sources.length }} 个网页</span>
    </header>
    <div class="source-card-list">
      <a
        v-for="(source, sourceIndex) in sources"
        :key="source.url"
        class="source-card"
        :href="source.url"
        target="_blank"
        rel="noreferrer"
      >
        <span class="source-number">{{ sourceIndex + 1 }}</span>
        <span class="source-icon">
          <span>{{ getSourceInitial(source) }}</span>
          <img
            v-if="source.icon"
            :src="source.icon"
            alt=""
            @error="($event.currentTarget as HTMLImageElement).style.display = 'none'"
          />
        </span>
        <span class="source-card-copy">
          <strong>{{ source.title }}</strong>
          <span>
            {{ getSourceLabel(source) }}
            <template v-if="formatSourceDate(source.publishedAt)">
              · {{ formatSourceDate(source.publishedAt) }}
            </template>
          </span>
        </span>
        <TopRight :size="15" />
      </a>
    </div>
  </section>
</template>

<script setup lang="ts">
import { TopRight } from '@element-plus/icons-vue'

import type { WebSearchSource } from '@/stores/chat'

defineProps<{
  sources: WebSearchSource[]
}>()

const getSourceHost = (source: WebSearchSource) => {
  try {
    return new URL(source.url).hostname.replace(/^www\./, '')
  } catch {
    return source.siteName ?? '网页来源'
  }
}

const getSourceLabel = (source: WebSearchSource) => source.siteName?.trim() || getSourceHost(source)

const getSourceInitial = (source: WebSearchSource) => getSourceLabel(source).slice(0, 1).toUpperCase()

const formatSourceDate = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date)
}
</script>
