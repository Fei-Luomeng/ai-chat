<template>
  <!-- 来源卡片顺序必须与正文中的引用编号保持一致。 -->
  <section class="message-sources" aria-label="回答来源">
    <header>
      <strong>来源</strong>
      <span>{{ sources.length }} 个网页</span>
    </header>
    <!-- 卡片使用真实链接，点击后由浏览器在新标签页打开。 -->
    <div class="source-card-list">
      <!-- target="_blank" 新标签打开；rel="noreferrer" 防止新页面拿到当前窗口引用。 -->
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
          <!-- 图标加载失败时隐藏 img，下面的文字首字母仍作为兜底图标。 -->
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
// TopRight 是“在新页面打开链接”的箭头图标，显示在每张来源卡片右侧。
import { TopRight } from '@element-plus/icons-vue'

// WebSearchSource 是联网搜索来源的数据类型，不是 Vue 组件。
import type { WebSearchSource } from '@/stores/chat'

// 来源展示字段由不同搜索接口返回，因此每个字段都需要回退策略。
defineProps<{
  sources: WebSearchSource[]
}>()

const getSourceHost = (source: WebSearchSource) => {
  // URL 无法解析时优先保留接口提供的网站名。
  try {
    // URL 是浏览器内置解析器，比手动 split('/') 更能正确处理端口、查询参数等情况。
    return new URL(source.url).hostname.replace(/^www\./, '')
  } catch {
    return source.siteName ?? '网页来源'
  }
}

// 接口提供了非空站点名就使用；否则从 URL 中解析域名。
// 这里使用 || 是因为 trim() 后的空字符串也应继续走右侧兜底。
const getSourceLabel = (source: WebSearchSource) => source.siteName?.trim() || getSourceHost(source)

// slice(0, 1) 取首字符，toUpperCase 让英文站点首字母统一大写。
const getSourceInitial = (source: WebSearchSource) => getSourceLabel(source).slice(0, 1).toUpperCase()

const formatSourceDate = (value?: string) => {
  // 无法识别的日期原样展示，避免把有效但非标准格式直接丢失。
  if (!value) return ''
  const date = new Date(value)
  // 无效 Date 的 getTime() 会返回 NaN；Number.isNaN 只判断真正的 NaN，不做隐式类型转换。
  if (Number.isNaN(date.getTime())) return value

  // Intl.DateTimeFormat 按地区规则格式化日期，避免手动拼接月、日和补零。
  return new Intl.DateTimeFormat('zh-CN', {
    // 当年来源省略年份，历史来源补充年份。
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date)
}
</script>
