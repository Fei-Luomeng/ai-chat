<template>
  <main class="chat-shell" :class="{ 'sidebar-collapsed': isSidebarCollapsed, 'theme-dark': themeMode === 'dark' }">
    <ChatSidebar
      :action-menu-style="actionMenuStyle"
      :active-project="activeProject"
      :active-session-id="chatStore.activeSessionId"
      :avatar-image="avatarImage"
      :favorite-results="favoriteResults"
      :get-favorite-preview="getExportMessagePreview"
      :is-mobile-viewport="isMobileViewport"
      :is-pending-new-session="isPendingNewSession"
      :is-pending-project-session="isPendingProjectSession"
      :is-project-home="isProjectHome"
      :open-action-menu="openActionMenu"
      :profile-name="profileName"
      :projects="projects"
      :projects-open="isProjectsOpen"
      :recent-open="isRecentOpen"
      :saved-avatar-display="savedAvatarDisplay"
      :sessions="sidebarSessions"
      @close="isSidebarCollapsed = true"
      @create-project="openCreateProjectDialog"
      @delete-project="deleteProject"
      @delete-session="deleteSession"
      @manage-favorites="openFavoritesManager"
      @new-chat="createSession"
      @open-search="openSearch"
      @open-settings="openSettings"
      @rename-project="renameProject"
      @rename-session="renameSession"
      @select-favorite="switchFromFavorite"
      @select-project="selectProject"
      @select-session="selectChatSession"
      @toggle-action-menu="toggleActionMenu"
      @toggle-projects="isProjectsOpen = !isProjectsOpen"
      @toggle-recent="isRecentOpen = !isRecentOpen"
      @toggle-session-pinned="toggleChatSessionPinned"
    />

    <button
      v-if="isMobileViewport && !isSidebarCollapsed"
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭侧边栏"
      @click="isSidebarCollapsed = true"
    />

    <section class="conversation">
      <ConversationHeader
        :context-cleared="Boolean(activeSession?.contextClearedAt)"
        :has-messages="Boolean(activeSession?.messages.length)"
        :is-mobile-viewport="isMobileViewport"
        :is-project-mode="isProjectMode"
        :is-responding="isResponding"
        :project-name="activeProject"
        :session-title="headerSessionTitle"
        :sidebar-collapsed="isSidebarCollapsed"
        @clear-context="openContextClearDialog"
        @import-session="importMarkdownSession"
        @open-export="openExportDialog"
        @open-session-search="openSessionSearch"
        @open-sidebar="isSidebarCollapsed = false"
      />

      <ProjectHome
        v-if="isProjectMode && isProjectHome"
        :action-menu-style="actionMenuStyle"
        :agent-mode="isAgentMode"
        :deep-thinking="isDeepThinking"
        :description="projectDescriptions[activeProject] ?? ''"
        :draft="draft"
        :format-time="formatTime"
        :get-preview="getResultPreview"
        :open-action-menu="openActionMenu"
        :project-name="activeProject"
        :responding="isResponding"
        :sessions="activeProjectSessions"
        :templates="promptTemplates"
        :web-search="isWebSearch"
        @apply-template="applyPromptTemplate"
        @delete-session="deleteSession"
        @manage-templates="openTemplateManager"
        @rename-session="renameSession"
        @select-session="switchProjectSession"
        @send="sendProjectMessage"
        @stop="stopResponding"
        @toggle-action-menu="toggleActionMenu"
        @toggle-agent-mode="toggleAgentMode"
        @toggle-deep-thinking="toggleDeepThinking"
        @toggle-pinned="toggleProjectSessionPinned"
        @toggle-web-search="toggleWebSearch"
        @update-description="projectDescriptions[activeProject] = $event"
        @update-draft="draft = $event"
      />

      <WelcomeView
        v-else-if="isFreshSession"
        :active-project="activeProject"
        :agent-mode="isAgentMode"
        :avatar-image="avatarImage"
        :deep-thinking="isDeepThinking"
        :draft="draft"
        :is-project-mode="isProjectMode"
        :responding="isResponding"
        :saved-avatar-display="savedAvatarDisplay"
        :templates="promptTemplates"
        :web-search="isWebSearch"
        @apply-template="applyPromptTemplate"
        @manage-templates="openTemplateManager"
        @send="send"
        @stop="stopResponding"
        @toggle-agent-mode="toggleAgentMode"
        @toggle-deep-thinking="toggleDeepThinking"
        @toggle-web-search="toggleWebSearch"
        @update-draft="draft = $event"
      />

      <template v-else>
        <MessageThread
          :active-message-id="activeMessageId"
          :editing-draft="editingDraft"
          :editing-message-id="editingMessageId"
          :get-answer-content="getAnswerContent"
          :get-branch-switcher="getBranchSwitcher"
          :get-reasoning-content="getReasoningContent"
          :get-reasoning-label="getReasoningLabel"
          :has-previous-user-message="hasPreviousUserMessage"
          :highlighted-message-id="highlightedMessageId"
          :hovered-navigator-item="hoveredNavigatorItem"
          :is-reasoning-open="isReasoningOpen"
          :is-responding="isResponding"
          :is-waiting-for-first-token="isWaitingForFirstToken"
          :messages="visibleMessages"
          :navigator-items="messageNavigatorItems"
          :streaming-assistant-message-content="streamingAssistantMessageContent"
          :streaming-assistant-message-id="streamingAssistantMessageId"
          @branch-from-assistant="branchFromAssistantMessage"
          @cancel-editing="cancelEditingMessage"
          @copy-message="copyMessage"
          @edit-message="startEditingMessage"
          @hide-navigator-tooltip="hideNavigatorTooltip"
          @jump-to-message="jumpToMessage"
          @message-area-click="copyRenderedCode"
          @message-area-ready="messagesRef = $event"
          @message-area-scroll="updateActiveMessageFromScroll"
          @regenerate="regenerateAssistantMessage"
          @select-branch="selectBranch"
          @show-navigator-tooltip="showNavigatorTooltip"
          @submit-edited-message="submitEditedMessage"
          @toggle-favorite="toggleMessageFavorite"
          @toggle-reasoning="toggleReasoning"
          @update-editing-draft="editingDraft = $event"
        />

        <div class="composer-panel">
          <PromptTemplateBar
            id-prefix="panel"
            :templates="promptTemplates"
            @apply="applyPromptTemplate"
            @manage="openTemplateManager"
          />
          <ChatComposer
            :agent-mode="isAgentMode"
            :deep-thinking="isDeepThinking"
            :draft="draft"
            hint
            placeholder="给 AI Chat 发送消息"
            :responding="isResponding"
            :web-search="isWebSearch"
            @send="send"
            @stop="stopResponding"
            @toggle-agent-mode="toggleAgentMode"
            @toggle-deep-thinking="toggleDeepThinking"
            @toggle-web-search="toggleWebSearch"
            @update-draft="draft = $event"
          />
        </div>
      </template>
    </section>

    <SearchDialogs
      :global-open="isSearchOpen"
      :global-query="searchText"
      :global-results="searchResults"
      :session-open="isSessionSearchOpen"
      :session-query="sessionSearchText"
      :session-results="sessionSearchResults"
      @close-global="closeSearch"
      @close-session="closeSessionSearch"
      @select-global="switchFromSearch"
      @select-session="switchFromSessionSearch"
      @update-global-query="searchText = $event"
      @update-session-query="sessionSearchText = $event"
    />
    <ContextClearDialog
      :open="isContextClearOpen"
      :title="activeSession?.title ?? '当前对话'"
      @close="closeContextClearDialog"
      @confirm="clearCurrentContext"
    />
    <FavoritesDialog
      :favorites="favoriteResults"
      :filtered-favorites="filteredFavoriteResults"
      :get-preview="(favorite) => getExportMessagePreview(favorite.message)"
      :open="isFavoritesOpen"
      :scope="favoriteScope"
      :scope-options="favoriteScopeOptions"
      :search-text="favoriteSearchText"
      @close="closeFavoritesManager"
      @open-favorite="switchFromFavorite($event); closeFavoritesManager()"
      @remove="removeFavorite"
      @update-scope="favoriteScope = $event"
      @update-search-text="favoriteSearchText = $event"
    />
    <TemplateManagerDialog
      :draft-label="draftTemplateLabel"
      :draft-prompt="draftTemplatePrompt"
      :editing-id="editingTemplateId"
      :open="isTemplateManagerOpen"
      :templates="promptTemplates"
      @close="closeTemplateManager"
      @delete-template="deletePromptTemplate"
      @edit-template="editPromptTemplate"
      @reset-draft="resetTemplateDraft"
      @restore-defaults="restoreDefaultTemplates"
      @save="savePromptTemplate"
      @update-draft-label="draftTemplateLabel = $event"
      @update-draft-prompt="draftTemplatePrompt = $event"
    />
    <ExportDialog
      :get-preview="getExportMessagePreview"
      :messages="exportableMessages"
      :mode="exportMode"
      :open="isExportOpen"
      :selected-ids="selectedExportMessageIds"
      :selected-total="selectedExportMessages.length"
      :title="activeSession?.title ?? 'AI Chat 对话'"
      @close="closeExportDialog"
      @confirm="exportCurrentSession"
      @toggle-message="toggleExportMessage"
      @update-mode="exportMode = $event"
    />
    <SettingsDialog
      :avatar-image="avatarImage"
      :avatar-text="savedAvatarDisplay"
      :model-settings="draftModelSettings"
      :open="isSettingsOpen"
      :profile-name="draftProfileName"
      :theme-mode="draftThemeMode"
      @avatar-upload="handleAvatarUpload"
      @close="closeSettings"
      @save="saveSettings"
      @update-model-settings="draftModelSettings = $event"
      @update-profile-name="draftProfileName = $event"
      @update-theme-mode="draftThemeMode = $event"
    />
    <ActionDialog
      :dialog="actionDialog"
      @close="closeActionDialog"
      @confirm="confirmActionDialog"
      @update-value="actionDialog && (actionDialog.value = $event)"
    />
  </main>
</template>

<script setup lang="ts">
import ChatComposer from '@/components/chat/ChatComposer.vue'
import ChatSidebar from '@/components/chat/ChatSidebar.vue'
import ConversationHeader from '@/components/chat/ConversationHeader.vue'
import MessageThread from '@/components/chat/MessageThread.vue'
import ProjectHome from '@/components/chat/ProjectHome.vue'
import PromptTemplateBar from '@/components/chat/PromptTemplateBar.vue'
import SearchDialogs from '@/components/chat/SearchDialogs.vue'
import WelcomeView from '@/components/chat/WelcomeView.vue'
import ActionDialog from '@/components/dialogs/ActionDialog.vue'
import ContextClearDialog from '@/components/dialogs/ContextClearDialog.vue'
import ExportDialog from '@/components/dialogs/ExportDialog.vue'
import FavoritesDialog from '@/components/dialogs/FavoritesDialog.vue'
import SettingsDialog from '@/components/dialogs/SettingsDialog.vue'
import TemplateManagerDialog from '@/components/dialogs/TemplateManagerDialog.vue'
import { useChatApp } from '@/composables/useChatApp'

const {
  chatStore,
  draft,
  messagesRef,
  editingMessageId,
  editingDraft,
  isMobileViewport,
  isSidebarCollapsed,
  isSearchOpen,
  isSessionSearchOpen,
  isExportOpen,
  isFavoritesOpen,
  isTemplateManagerOpen,
  isContextClearOpen,
  searchText,
  sessionSearchText,
  favoriteSearchText,
  favoriteScope,
  isProjectsOpen,
  isRecentOpen,
  isSettingsOpen,
  activeProject,
  isProjectHome,
  isPendingNewSession,
  isPendingProjectSession,
  draftModelSettings,
  isDeepThinking,
  isAgentMode,
  isWebSearch,
  exportMode,
  selectedExportMessageIds,
  editingTemplateId,
  draftTemplateLabel,
  draftTemplatePrompt,
  activeMessageId,
  highlightedMessageId,
  hoveredNavigatorItem,
  openActionMenu,
  actionMenuStyle,
  actionDialog,
  projectDescriptions,
  profileName,
  draftProfileName,
  avatarImage,
  themeMode,
  draftThemeMode,
  promptTemplates,
  activeSession,
  isFreshSession,
  isProjectMode,
  isResponding,
  isWaitingForFirstToken,
  streamingAssistantMessageId,
  streamingAssistantMessageContent,
  headerSessionTitle,
  projects,
  searchResults,
  sessionSearchResults,
  sidebarSessions,
  activeProjectSessions,
  favoriteResults,
  visibleMessages,
  favoriteScopeOptions,
  filteredFavoriteResults,
  messageNavigatorItems,
  exportableMessages,
  selectedExportMessages,
  savedAvatarDisplay,
  updateActiveMessageFromScroll,
  jumpToMessage,
  copyRenderedCode,
  getReasoningContent,
  getAnswerContent,
  getBranchSwitcher,
  selectBranch,
  copyMessage,
  toggleMessageFavorite,
  switchFromFavorite,
  openFavoritesManager,
  closeFavoritesManager,
  removeFavorite,
  openExportDialog,
  closeExportDialog,
  toggleExportMessage,
  getExportMessagePreview,
  exportCurrentSession,
  importMarkdownSession,
  isReasoningOpen,
  toggleReasoning,
  getReasoningLabel,
  toggleDeepThinking,
  toggleAgentMode,
  toggleWebSearch,
  applyPromptTemplate,
  resetTemplateDraft,
  openTemplateManager,
  closeTemplateManager,
  editPromptTemplate,
  savePromptTemplate,
  deletePromptTemplate,
  restoreDefaultTemplates,
  openContextClearDialog,
  closeContextClearDialog,
  clearCurrentContext,
  toggleChatSessionPinned,
  toggleProjectSessionPinned,
  startEditingMessage,
  cancelEditingMessage,
  hasPreviousUserMessage,
  branchFromAssistantMessage,
  submitEditedMessage,
  regenerateAssistantMessage,
  showNavigatorTooltip,
  hideNavigatorTooltip,
  send,
  stopResponding,
  openSearch,
  closeSearch,
  openSessionSearch,
  closeSessionSearch,
  switchFromSearch,
  switchFromSessionSearch,
  getResultPreview,
  createSession,
  selectProject,
  switchProjectSession,
  selectChatSession,
  sendProjectMessage,
  toggleActionMenu,
  openCreateProjectDialog,
  renameProject,
  deleteProject,
  renameSession,
  deleteSession,
  closeActionDialog,
  confirmActionDialog,
  handleAvatarUpload,
  openSettings,
  saveSettings,
  closeSettings,
  formatTime,
} = useChatApp()
</script>
