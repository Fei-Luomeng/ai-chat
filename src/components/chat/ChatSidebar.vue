<template>
  <aside class="sidebar">
    <div class="sidebar-top">
      <button class="sidebar-icon-button" type="button" aria-label="搜索" @click="emit('openSearch')">
        <Search :size="18" />
      </button>
      <button class="sidebar-title" type="button">
        <span class="brand-mark">
          <ChatDotRound :size="18" />
        </span>
        <span>AI Chat</span>
      </button>
      <button
        class="sidebar-icon-button collapse-trigger"
        type="button"
        :aria-label="isMobileViewport ? '关闭侧边栏' : '收起侧边栏'"
        @click="emit('close')"
      >
        <component :is="isMobileViewport ? Close : MoreFilled" :size="18" />
      </button>
    </div>

    <button class="new-chat" type="button" @click="emit('newChat')">
      <Plus :size="18" />
      <span>新建对话</span>
    </button>

    <div class="sidebar-scroll">
      <section class="sidebar-section project-section" :class="{ closed: !projectsOpen }">
        <button class="section-toggle" type="button" @click="emit('toggleProjects')">
          <component :is="projectsOpen ? ArrowDown : ArrowRight" :size="14" />
          <span>项目</span>
        </button>
        <div class="project-list">
          <button class="new-project" type="button" @click="emit('createProject')">
            <span class="folder-plus">
              <Folder :size="19" />
              <Plus :size="11" />
            </span>
            <span>新项目</span>
          </button>
          <div v-for="project in projects" :key="project" class="nav-row-wrap">
            <button
              class="project-item"
              :class="{ active: project === activeProject }"
              type="button"
              @click="emit('selectProject', project)"
            >
              <component :is="project === activeProject ? FolderOpened : Folder" :size="16" />
              <span>{{ project }}</span>
            </button>
            <button
              class="row-action"
              type="button"
              aria-label="项目操作"
              @click.stop="emit('toggleActionMenu', `project-${project}`, $event)"
            >
              <MoreFilled :size="15" />
            </button>
            <div v-if="openActionMenu === `project-${project}`" class="action-menu" :style="actionMenuStyle">
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

      <section class="sidebar-section recent-section" :class="{ closed: !recentOpen }">
        <button class="section-toggle" type="button" @click="emit('toggleRecent')">
          <component :is="recentOpen ? ArrowDown : ArrowRight" :size="14" />
          <span>最近的对话</span>
        </button>
        <div class="session-list">
          <p v-if="sessions.length === 0" class="sidebar-empty">暂无对话</p>
          <div v-for="session in sessions" :key="session.id" class="nav-row-wrap">
            <button
              class="session-item"
              :class="{
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
            <button
              class="row-action"
              type="button"
              aria-label="对话操作"
              @click.stop="emit('toggleActionMenu', `session-${session.id}`, $event)"
            >
              <MoreFilled :size="15" />
            </button>
            <div v-if="openActionMenu === `session-${session.id}`" class="action-menu" :style="actionMenuStyle">
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

      <section class="sidebar-section favorite-section">
        <div class="favorite-section-header">
          <h2>收藏回答</h2>
          <button type="button" @click="emit('manageFavorites')">管理</button>
        </div>
        <div class="favorite-list">
          <p v-if="favoriteResults.length === 0" class="sidebar-empty">暂无收藏</p>
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

    <div class="sidebar-footer">
      <button class="footer-action" type="button" @click="emit('openConversationManager')">
        <Box :size="17" />
        <span>归档与回收站</span>
      </button>
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

import type { ChatMessage, ChatSession } from '@/stores/chat'
import type { FavoriteResult } from '@/types/ui'

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
