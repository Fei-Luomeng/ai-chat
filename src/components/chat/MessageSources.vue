<template>
  <!-- 来源卡片顺序必须与正文中的引用编号保持一致。 -->
  <section class="message-sources" aria-label="回答来源">
    <header>
      <strong>来源</strong>
      <span>{{ sources.length }} 个网页</span>
    </header>
    <!-- 卡片使用真实链接，点击后由浏览器在新标签页打开。 -->
    <div class="source-card-list">
      <a
        v-for="(source, sourceIndex) in sources"
        :key="source.url"
        class="source-card"
        :data-source-index="sourceIndex"
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

// 来源展示字段由不同搜索接口返回，因此每个字段都需要回退策略。
defineProps<{
  sources: WebSearchSource[]
}>()

const getSourceHost = (source: WebSearchSource) => {
  // URL 无法解析时优先保留接口提供的网站名。
  try {
    return new URL(source.url).hostname.replace(/^www\./, '')
  } catch {
    return source.siteName ?? '网页来源'
  }
}

const getSourceLabel = (source: WebSearchSource) => source.siteName?.trim() || getSourceHost(source)

const getSourceInitial = (source: WebSearchSource) => getSourceLabel(source).slice(0, 1).toUpperCase()

const formatSourceDate = (value?: string) => {
  // 无法识别的日期原样展示，避免把有效但非标准格式直接丢失。
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    // 当年来源省略年份，历史来源补充年份。
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date)
}
</script>
