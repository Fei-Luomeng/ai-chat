<template>
  <!-- 项目首页是项目容器视图，不代表已经进入某条具体会话。 -->
  <div class="project-home">
    <div class="project-home-inner">
      <!-- 项目标题和说明会作为项目上下文的一部分参与后续请求。 -->
      <div class="project-title-row">
        <FolderOpened :size="34" />
        <h1>{{ projectName }}</h1>
      </div>
      <!--
        原生 input 事件的 target 类型默认只是 EventTarget，
        TypeScript 不知道它一定有 value，所以用 as HTMLTextAreaElement 缩小类型。
      -->
      <textarea
        :value="description"
        class="project-description"
        placeholder="添加项目说明，让这个项目里的对话有更清晰的背景。"
        @input="emit('updateDescription', ($event.target as HTMLTextAreaElement).value)"
      />
      <!-- 项目首页可直接套用模板并创建第一条项目会话。 -->
      <PromptTemplateBar
        id-prefix="project"
        :templates="templates"
        @apply="emit('applyTemplate', $event)"
        @manage="emit('manageTemplates')"
      />
      <ChatComposer
        :agent-mode="agentMode"
        :deep-thinking="deepThinking"
        :draft="draft"
        :is-listening="isListening"
        :placeholder="`${projectName}中的新聊天`"
        :responding="responding"
        variant="project"
        :voice-input-supported="voiceInputSupported"
        :web-search="webSearch"
        @send="emit('send')"
        @stop="emit('stop')"
        @toggle-agent-mode="emit('toggleAgentMode')"
        @toggle-deep-thinking="emit('toggleDeepThinking')"
        @toggle-voice-input="emit('toggleVoiceInput')"
        @toggle-web-search="emit('toggleWebSearch')"
        @update-draft="emit('updateDraft', $event)"
      />
      <!-- 当前只提供聊天类型，保留 tabs 结构便于以后扩展项目内容类型。 -->
      <div class="project-tabs">
        <!-- “聊天”是当前选中的项目内容分类，目前没有其他分类，因此暂不切换状态。 -->
        <button class="active" type="button">聊天</button>
      </div>
      <!-- 项目内会话列表与普通侧边栏会话相互独立。 -->
      <div class="project-chat-list">
        <!-- 点击整行打开会话；行内菜单按钮使用 .stop，避免同时触发打开。 -->
        <article
          v-for="session in sessions"
          :key="`home-${session.id}`"
          class="project-chat-row"
          @click="emit('selectSession', session.id)"
        >
          <div>
            <h3>
              <Connection v-if="session.branchParentSessionId" :size="16" />
              {{ session.title }}
              <small v-if="session.pinned" class="pin-mark project-pin">置顶</small>
            </h3>
            <small v-if="session.branchParentSessionId" class="project-branch-label">新聊天中的分支</small>
            <p>{{ getPreview(session) }}</p>
          </div>
          <time>{{ formatTime(session.updatedAt) }}</time>
          <!-- 更多按钮：只打开这条项目会话的操作菜单，不触发外层的打开会话事件。 -->
          <button
            class="home-row-action"
            type="button"
            aria-label="对话操作"
            @click.stop="emit('toggleActionMenu', `home-session-${session.id}`, $event)"
          >
            <MoreFilled :size="17" />
          </button>
          <!-- 操作菜单定位由外层 composable 统一计算。 -->
          <!-- actionMenuStyle 是父级根据触发按钮位置计算出的 fixed 坐标对象。 -->
          <div
            v-if="openActionMenu === `home-session-${session.id}`"
            class="action-menu home-menu"
            :style="actionMenuStyle"
          >
            <!--
              置顶调整项目会话排序；重命名修改标题；归档移到归档区；
              删除将会话移入回收站，四个按钮都把实际操作交给父组件。
            -->
            <button type="button" @click.stop="emit('togglePinned', session)">
              <ChatDotRound :size="16" />
              <span>{{ session.pinned ? '取消置顶' : '置顶对话' }}</span>
            </button>
            <button type="button" @click.stop="emit('renameSession', session)">
              <EditPen :size="16" />
              <span>重命名对话</span>
            </button>
            <button type="button" @click.stop="emit('archiveSession', session.id)">
              <Box :size="16" />
              <span>归档对话</span>
            </button>
            <button type="button" class="danger" @click.stop="emit('deleteSession', session.id)">
              <Delete :size="16" />
              <span>删除对话</span>
            </button>
          </div>
        </article>
        <p v-if="sessions.length === 0" class="project-empty">还没有项目对话。先在上方输入第一条消息。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 以下均为 Element Plus 图标组件：
// Box 用于项目标识，ChatDotRound 用于会话入口，Connection 用于联网状态；
// Delete/EditPen 用于删除和重命名，FolderOpened 用于项目文件夹，MoreFilled 用于更多操作按钮。
import { Box, ChatDotRound, Connection, Delete, EditPen, FolderOpened, MoreFilled } from '@element-plus/icons-vue'

// ChatComposer：项目首页的输入器，从这里发送会自动创建一条项目会话。
import ChatComposer from '@/components/chat/ChatComposer.vue'
// PromptTemplateBar：项目首页的快捷提示词栏，把选中的模板内容交给父组件。
import PromptTemplateBar from '@/components/chat/PromptTemplateBar.vue'
// 下面两个 import type 只提供 TS 类型，不会渲染组件，也不会进入浏览器运行代码。
// ChatSession 描述项目会话数据；PromptTemplate 描述提示词模板数据。
import type { ChatSession } from '@/stores/chat'
import type { PromptTemplate } from '@/types/ui'

// ProjectHome 同时组合 PromptTemplateBar 和 ChatComposer，
// 但只是转发事件，不复制它们的业务逻辑。
// 项目首页采用受控组件设计：description、draft、sessions 都由父级传入，
// 用户操作只通过 emit 上报。这样项目数据只有 useChatApp 一个修改入口。
// 组件只负责项目首页展示，创建会话和持久化仍由父级完成。
defineProps<{
  actionMenuStyle: Record<string, string>
  agentMode: boolean
  description: string
  draft: string
  deepThinking: boolean
  isListening: boolean
  openActionMenu: string
  projectName: string
  responding: boolean
  sessions: ChatSession[]
  templates: PromptTemplate[]
  voiceInputSupported: boolean
  webSearch: boolean
  getPreview: (session: ChatSession) => string
  formatTime: (timestamp: number) => string
}>()

const emit = defineEmits<{
  archiveSession: [sessionId: string]
  applyTemplate: [template: PromptTemplate]
  deleteSession: [sessionId: string]
  manageTemplates: []
  renameSession: [session: ChatSession]
  selectSession: [sessionId: string]
  send: []
  stop: []
  toggleActionMenu: [menuId: string, event: MouseEvent]
  toggleAgentMode: []
  toggleDeepThinking: []
  toggleVoiceInput: []
  togglePinned: [session: ChatSession]
  toggleWebSearch: []
  updateDescription: [value: string]
  updateDraft: [value: string]
}>()
</script>
