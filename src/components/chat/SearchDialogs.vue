<template>
  <!-- 全局搜索会跨普通会话和所有项目会话。 -->
  <div v-if="globalOpen" class="search-overlay" @click.self="emit('closeGlobal')">
    <div class="search-dialog">
      <div class="search-box">
        <Search :size="20" />
        <input
          :value="globalQuery"
          placeholder="搜索对话内容..."
          @input="emit('updateGlobalQuery', ($event.target as HTMLInputElement).value)"
        />
        <!-- 已输入关键词时，右侧按钮只清空关键词并保留弹窗。 -->
        <button
          v-if="globalQuery"
          type="button"
          aria-label="清除搜索"
          @click="emit('updateGlobalQuery', '')"
        >
          <Close :size="18" />
        </button>
        <!-- 没有关键词时，同一位置的按钮直接关闭全局搜索弹窗。 -->
        <button v-else type="button" aria-label="关闭搜索" @click="emit('closeGlobal')">
          <Close :size="18" />
        </button>
      </div>
      <!-- 空关键词展示引导，有关键词时展示标题和消息双类型结果。 -->
      <div class="search-results" :class="{ idle: !globalQuery.trim() }">
        <p v-if="!globalQuery.trim()" class="search-idle">输入关键词后开始搜索对话</p>
        <!-- 搜索结果按钮：切换到结果所属会话；消息结果还会继续定位到具体消息。 -->
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
            <!--
              这是嵌套三元：
              标题结果显示“标题命中”；消息结果再根据 role 显示“AI Chat”或“你”。
            -->
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

  <!-- 当前会话搜索复用相同外观，但结果不会触发跨会话切换。 -->
  <div v-if="sessionOpen" class="search-overlay" @click.self="emit('closeSession')">
    <div class="search-dialog session-search-dialog">
      <div class="search-box">
        <Search :size="20" />
        <input
          :value="sessionQuery"
          placeholder="搜索当前会话..."
          @input="emit('updateSessionQuery', ($event.target as HTMLInputElement).value)"
        />
        <!-- 当前会话搜索有关键词时，点击只清空关键词。 -->
        <button
          v-if="sessionQuery"
          type="button"
          aria-label="清除搜索"
          @click="emit('updateSessionQuery', '')"
        >
          <Close :size="18" />
        </button>
        <!-- 当前会话搜索没有关键词时，点击关闭弹窗。 -->
        <button v-else type="button" aria-label="关闭当前会话搜索" @click="emit('closeSession')">
          <Close :size="18" />
        </button>
      </div>
      <div class="search-results" :class="{ idle: !sessionQuery.trim() }">
        <p v-if="!sessionQuery.trim()" class="search-idle">输入关键词后搜索当前会话</p>
        <!-- 结果按钮：不切换会话，只滚动定位当前会话内对应的消息。 -->
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
// Close 用于关闭搜索弹窗；Search 用于搜索输入框和空状态提示。
import { Close, Search } from '@element-plus/icons-vue'

// SearchResult 是搜索结果对象的 TS 类型，不是组件；用于约束结果列表和选择事件。
import type { SearchResult } from '@/types/ui'

// 全局搜索和会话内搜索结构相似，因此放在同一组件中复用样式和高亮逻辑。
// 两组 props/事件保持独立，打开其中一个不会自动修改另一组查询词。
// 两个弹窗共享组件，分别维护查询词、结果和选择事件。
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
  // 返回文本片段而非 v-html，避免搜索内容进入 HTML 注入路径。
  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) return [{ text: content, hit: false }]

  const lowerContent = content.toLowerCase()
  const lowerKeyword = normalizedKeyword.toLowerCase()
  // Array<{...}> 表示数组中每一项都必须包含 text 和 hit 两个字段。
  const parts: Array<{ text: string; hit: boolean }> = []
  let cursor = 0
  let index = lowerContent.indexOf(lowerKeyword)

  // 保留所有重复命中，模板据此逐段渲染 mark。
  // indexOf 找不到时返回 -1；传入第二个参数 cursor 后会从该位置继续向后搜索。
  while (index !== -1) {
    if (index > cursor) parts.push({ text: content.slice(cursor, index), hit: false })
    // slice(start, end) 截取字符串时包含 start、不包含 end。
    parts.push({ text: content.slice(index, index + normalizedKeyword.length), hit: true })
    cursor = index + normalizedKeyword.length
    index = lowerContent.indexOf(lowerKeyword, cursor)
  }

  if (cursor < content.length) parts.push({ text: content.slice(cursor), hit: false })
  return parts
}

const formatTime = (timestamp: number) =>
  // 搜索结果只需要当天的时分，不展示完整日期。
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
</script>
