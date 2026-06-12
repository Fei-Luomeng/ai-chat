<template>
  <!-- 主导航同时承担桌面固定侧栏和移动端抽屉两种布局。 -->
  <aside class="sidebar">
    <!-- 品牌栏：搜索入口、标题和收起按钮。 -->
    <div class="sidebar-top">
      <!-- 搜索按钮：通知父组件打开全局搜索，可搜索普通会话和项目会话。 -->
      <button class="sidebar-icon-button" type="button" aria-label="搜索" @click="emit('openSearch')">
        <Search :size="18" />
      </button>
      <!-- 品牌按钮：当前只展示产品名称和图标，没有绑定点击业务。 -->
      <button class="sidebar-title" type="button">
        <span class="brand-mark">
          <ChatDotRound :size="18" />
        </span>
        <span>AI Chat</span>
      </button>
      <!-- 收起按钮：桌面端折叠侧栏，移动端关闭侧栏抽屉。 -->
      <button
        class="sidebar-icon-button collapse-trigger"
        type="button"
        :aria-label="isMobileViewport ? '关闭侧边栏' : '收起侧边栏'"
        @click="emit('close')"
      >
        <!-- component :is 用于动态选择组件，这里根据屏幕宽度切换图标。 -->
        <component :is="isMobileViewport ? Close : MoreFilled" :size="18" />
      </button>
    </div>

    <!-- 新建对话按钮：进入临时空白态，发送第一条消息后才真正创建会话。 -->
    <button class="new-chat" type="button" @click="emit('newChat')">
      <Plus :size="18" />
      <span>新建对话</span>
    </button>

    <div class="sidebar-scroll">
      <!-- 项目导航：项目本身和项目内会话使用不同页面展示。 -->
      <!-- closed class 只负责视觉折叠，项目数组本身仍保留。 -->
      <section class="sidebar-section project-section" :class="{ closed: !projectsOpen }">
        <!-- 项目分组按钮：只展开/收起下面的项目列表，不会删除或改变项目数据。 -->
        <button class="section-toggle" type="button" @click="emit('toggleProjects')">
          <component :is="projectsOpen ? ArrowDown : ArrowRight" :size="14" />
          <span>项目</span>
        </button>
        <div class="project-list">
          <!-- 新项目按钮：打开创建项目弹窗，确认名称后才真正新增项目。 -->
          <button class="new-project" type="button" @click="emit('createProject')">
            <span class="folder-plus">
              <Folder :size="19" />
              <Plus :size="11" />
            </span>
            <span>新项目</span>
          </button>
          <!--
            v-for 渲染列表时必须提供稳定 key。
            Vue 使用 key 判断节点是复用、移动还是重新创建，项目名在这里充当唯一标识。
          -->
          <div v-for="project in projects" :key="project" class="nav-row-wrap">
            <!-- 项目名称按钮：进入该项目首页；选中样式不代表已经打开项目内某条会话。 -->
            <button
              class="project-item"
              :class="{ active: project === activeProject }"
              type="button"
              @click="emit('selectProject', project)"
            >
              <component :is="project === activeProject ? FolderOpened : Folder" :size="16" />
              <span>{{ project }}</span>
            </button>
            <!-- 更多按钮：打开当前项目的操作菜单；.stop 避免同时触发项目选择。 -->
            <button
              class="row-action"
              type="button"
              aria-label="项目操作"
              @click.stop="emit('toggleActionMenu', `project-${project}`, $event)"
            >
              <MoreFilled :size="15" />
            </button>
            <div v-if="openActionMenu === `project-${project}`" class="action-menu" :style="actionMenuStyle">
              <!-- 重命名打开带原名称的输入弹窗；删除打开危险操作确认弹窗。 -->
              <button type="button" @click="emit('renameProject', project)">
                <EditPen :size="16" />
                <span>重命名项目</span>
              </button>
              <button type="button" class="danger" @click="emit('deleteProject', project)">
                <Delete :size="16" />
                <span>删除项目</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 普通会话列表不包含项目会话，也排除归档和回收站内容。 -->
      <section class="sidebar-section recent-section" :class="{ closed: !recentOpen }">
        <!-- 最近对话分组按钮：只控制会话列表展开/收起。 -->
        <button class="section-toggle" type="button" @click="emit('toggleRecent')">
          <component :is="recentOpen ? ArrowDown : ArrowRight" :size="14" />
          <span>最近的对话</span>
        </button>
        <div class="session-list">
          <p v-if="sessions.length === 0" class="sidebar-empty">暂无对话</p>
          <div v-for="session in sessions" :key="session.id" class="nav-row-wrap">
            <!-- 会话名称按钮：切换到对应普通会话，并在主区域展示其消息。 -->
            <!-- 对象形式 :class 可同时根据多个布尔条件添加 active/branch/pinned。 -->
            <button
              class="session-item"
              :class="{
                // 临时新建态和项目首页不能误高亮旧会话。
                active:
                  session.id === activeSessionId &&
                  !isProjectHome &&
                  !isPendingNewSession &&
                  !isPendingProjectSession,
                branch: Boolean(session.branchParentSessionId),
                pinned: session.pinned,
              }"
              type="button"
              @click="emit('selectSession', session.id)"
            >
              <component :is="session.branchParentSessionId ? Connection : EditPen" :size="16" />
              <span class="session-item-copy">
                <span>{{ session.title }}</span>
                <small v-if="session.branchParentSessionId">新聊天中的分支</small>
              </span>
              <small v-if="session.pinned" class="pin-mark">置顶</small>
            </button>
            <!-- 会话更多按钮：打开当前会话的置顶、重命名、归档和删除菜单。 -->
            <button
              class="row-action"
              type="button"
              aria-label="对话操作"
              @click.stop="emit('toggleActionMenu', `session-${session.id}`, $event)"
            >
              <MoreFilled :size="15" />
            </button>
            <div v-if="openActionMenu === `session-${session.id}`" class="action-menu" :style="actionMenuStyle">
              <!--
                置顶改变列表排序；重命名修改标题；归档移到归档区；
                删除是软删除，会先进入回收站而不是立即永久清除。
              -->
              <button type="button" @click="emit('toggleSessionPinned', session)">
                <ChatDotRound :size="16" />
                <span>{{ session.pinned ? '取消置顶' : '置顶对话' }}</span>
              </button>
              <button type="button" @click="emit('renameSession', session)">
                <EditPen :size="16" />
                <span>重命名对话</span>
              </button>
              <button type="button" @click="emit('archiveSession', session.id)">
                <Box :size="16" />
                <span>归档对话</span>
              </button>
              <button type="button" class="danger" @click="emit('deleteSession', session.id)">
                <Delete :size="16" />
                <span>删除对话</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 侧边栏仅展示收藏摘要，完整筛选和删除操作放在管理弹窗。 -->
      <section class="sidebar-section favorite-section">
        <div class="favorite-section-header">
          <h2>收藏回答</h2>
          <!-- 管理按钮：打开完整收藏弹窗，可搜索、跳转或取消收藏。 -->
          <button type="button" @click="emit('manageFavorites')">管理</button>
        </div>
        <div class="favorite-list">
          <p v-if="favoriteResults.length === 0" class="sidebar-empty">暂无收藏</p>
          <!-- 收藏条目按钮：切换回该收藏所属会话，并定位到对应消息。 -->
          <button
            v-for="favorite in favoriteResults"
            :key="favorite.id"
            class="favorite-item"
            type="button"
            @click="emit('selectFavorite', favorite)"
          >
            <strong>{{ favorite.title }}</strong>
            <span>{{ getFavoritePreview(favorite.message) }}</span>
          </button>
        </div>
      </section>
    </div>

    <!-- 固定底部区域：会话管理、设置和当前用户信息。 -->
    <div class="sidebar-footer">
      <!-- 打开归档与回收站，可恢复、移入回收站或永久删除会话。 -->
      <button class="footer-action" type="button" @click="emit('openConversationManager')">
        <Box :size="17" />
        <span>归档与回收站</span>
      </button>
      <!-- 打开设置弹窗，编辑账户、主题、模型参数、自定义指令和记忆。 -->
      <button class="footer-action" type="button" @click="emit('openSettings')">
        <Setting :size="17" />
        <span>设置</span>
      </button>
      <div class="profile-chip">
        <span class="profile-avatar" :style="avatarImage ? { backgroundImage: `url(${avatarImage})` } : undefined">
          <template v-if="!avatarImage">{{ savedAvatarDisplay }}</template>
        </span>
        <strong>{{ profileName }}</strong>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
// 以下均为 Element Plus 图标组件，用在侧边栏按钮和列表项中：
// ArrowDown/ArrowRight 表示分组展开状态，Box/Folder/FolderOpened 表示项目；
// ChatDotRound 表示会话，Connection 表示联网，Plus 表示新建，Search 表示搜索；
// EditPen/Delete 表示重命名和删除，MoreFilled 表示更多菜单；
// Setting 表示设置入口，Close 用于移动端关闭侧栏。
import {
  ArrowDown,
  ArrowRight,
  Box,
  ChatDotRound,
  Close,
  Connection,
  Delete,
  EditPen,
  Folder,
  FolderOpened,
  MoreFilled,
  Plus,
  Search,
  Setting,
} from '@element-plus/icons-vue'

// ChatMessage/ChatSession 是聊天消息和会话的 TS 类型，用来检查 props 与事件参数。
import type { ChatMessage, ChatSession } from '@/stores/chat'
// FavoriteResult 是收藏搜索结果的 TS 类型；import type 不会引入运行时组件。
import type { FavoriteResult } from '@/types/ui'

// ChatSidebar 是较典型的“哑组件”：它展示父级准备好的列表，
// 不直接 import Pinia，也不决定删除、归档、切换模式的具体实现。
// 没有把 defineProps 赋值给变量，是因为脚本函数中不需要读取这些 prop；
// <script setup> 编译后仍会把它们直接暴露给模板使用。
// 侧边栏保持无业务状态，所有导航和 CRUD 行为通过事件交给父组件。
defineProps<{
  actionMenuStyle: Record<string, string>
  activeProject: string
  activeSessionId: string
  avatarImage: string
  favoriteResults: FavoriteResult[]
  getFavoritePreview: (message: ChatMessage) => string
  isMobileViewport: boolean
  isPendingNewSession: boolean
  isPendingProjectSession: boolean
  isProjectHome: boolean
  openActionMenu: string
  profileName: string
  projects: string[]
  projectsOpen: boolean
  recentOpen: boolean
  savedAvatarDisplay: string
  sessions: ChatSession[]
}>()

const emit = defineEmits<{
  // TypeScript 元组描述每个事件的参数。
  // [] 表示无参数，[sessionId: string] 表示必须传一个字符串。
  archiveSession: [sessionId: string]
  close: []
  createProject: []
  deleteProject: [projectName: string]
  deleteSession: [sessionId: string]
  manageFavorites: []
  newChat: []
  openSearch: []
  openConversationManager: []
  openSettings: []
  renameProject: [projectName: string]
  renameSession: [session: ChatSession]
  selectFavorite: [favorite: FavoriteResult]
  selectProject: [projectName: string]
  selectSession: [sessionId: string]
  toggleActionMenu: [menuId: string, event: MouseEvent]
  toggleProjects: []
  toggleRecent: []
  toggleSessionPinned: [session: ChatSession]
}>()
</script>
