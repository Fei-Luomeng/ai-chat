<template>
  <!-- 应用外壳：侧边栏、主对话区和全局弹窗都在这一层组装。 -->
  <main class="chat-shell" :class="{ 'sidebar-collapsed': isSidebarCollapsed, 'theme-dark': themeMode === 'dark' }">
    <!-- 左侧导航只展示数据并上抛操作，具体状态修改由 useChatApp 完成。 -->
    <ChatSidebar
      :action-menu-style="actionMenuStyle"
      :active-project="activeProject"
      :active-session-id="isProjectMode ? '' : activeSession?.id ?? ''"
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
      @archive-session="archiveSession"
      @close="isSidebarCollapsed = true"
      @create-project="openCreateProjectDialog"
      @delete-project="deleteProject"
      @delete-session="deleteSession"
      @manage-favorites="openFavoritesManager"
      @new-chat="createSession"
      @open-search="openSearch"
      @open-conversation-manager="openConversationManager"
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

    <!-- 主内容区按“项目首页 / 空会话 / 已有消息”三种状态切换。 -->
    <section class="conversation">
      <!-- 顶栏始终存在，负责当前会话工具和移动端侧栏入口。 -->
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

      <!-- 项目首页展示项目说明、首条消息输入和项目内历史会话。 -->
      <ProjectHome
        v-if="isProjectMode && isProjectHome"
        :action-menu-style="actionMenuStyle"
        :agent-mode="isAgentMode"
        :deep-thinking="isDeepThinking"
        :description="projectDescriptions[activeProject] ?? ''"
        :draft="draft"
        :format-time="formatTime"
        :get-preview="getResultPreview"
        :is-listening="isListening"
        :open-action-menu="openActionMenu"
        :project-name="activeProject"
        :responding="isResponding"
        :sessions="activeProjectSessions"
        :templates="promptTemplates"
        :voice-input-supported="voiceInputSupported"
        :web-search="isWebSearch"
        @archive-session="archiveSession"
        @apply-template="applyPromptTemplate"
        @delete-session="deleteSession"
        @manage-templates="openTemplateManager"
        @rename-session="renameSession"
        @select-session="switchProjectSession"
        @send="sendProjectMessageWithVoiceStop"
        @stop="stopResponding"
        @toggle-action-menu="toggleActionMenu"
        @toggle-agent-mode="toggleAgentMode"
        @toggle-deep-thinking="toggleDeepThinking"
        @toggle-voice-input="toggleVoiceInput"
        @toggle-pinned="toggleProjectSessionPinned"
        @toggle-web-search="toggleWebSearch"
        @update-description="projectDescriptions[activeProject] = $event"
        @update-draft="draft = $event"
      />

      <!-- 新建但尚未发送消息时使用居中的欢迎输入视图。 -->
      <WelcomeView
        v-else-if="isFreshSession"
        :active-project="activeProject"
        :agent-mode="isAgentMode"
        :avatar-image="avatarImage"
        :deep-thinking="isDeepThinking"
        :draft="draft"
        :is-project-mode="isProjectMode"
        :is-listening="isListening"
        :responding="isResponding"
        :saved-avatar-display="savedAvatarDisplay"
        :templates="promptTemplates"
        :voice-input-supported="voiceInputSupported"
        :web-search="isWebSearch"
        @apply-template="applyPromptTemplate"
        @manage-templates="openTemplateManager"
        @send="sendWithVoiceStop"
        @stop="stopResponding"
        @toggle-agent-mode="toggleAgentMode"
        @toggle-deep-thinking="toggleDeepThinking"
        @toggle-voice-input="toggleVoiceInput"
        @toggle-web-search="toggleWebSearch"
        @update-draft="draft = $event"
      />

      <template v-else>
        <!-- 已有消息时渲染消息流和底部固定输入区。 -->
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
          :hidden-message-count="hiddenMessageCount"
          :hovered-navigator-item="hoveredNavigatorItem"
          :is-reasoning-open="isReasoningOpen"
          :is-responding="isResponding"
          :is-waiting-for-first-token="isWaitingForFirstToken"
          :messages="renderedMessages"
          :navigator-items="messageNavigatorItems"
          :speech-playback-state="speechPlaybackState"
          :speech-synthesis-supported="speechSynthesisSupported"
          :spoken-message-id="spokenMessageId"
          :streaming-assistant-message-content="streamingAssistantMessageContent"
          :streaming-assistant-message-id="streamingAssistantMessageId"
          @branch-from-assistant="branchFromAssistantMessage"
          @cancel-editing="cancelEditingMessage"
          @copy-message="copyMessage"
          @continue-message="continueAssistantMessage"
          @edit-message="startEditingMessage"
          @hide-navigator-tooltip="hideNavigatorTooltip"
          @jump-to-message="jumpToMessage"
          @load-earlier="loadEarlierMessages"
          @message-area-click="copyRenderedCode"
          @message-area-ready="messagesRef = $event"
          @message-area-scroll="updateActiveMessageFromScroll"
          @regenerate="regenerateAssistantMessage"
          @retry-message="regenerateAssistantMessage"
          @select-branch="selectBranch"
          @show-navigator-tooltip="showNavigatorTooltip"
          @stop-speech="stopSpeaking"
          @submit-edited-message="submitEditedMessage"
          @toggle-favorite="toggleMessageFavorite"
          @toggle-reasoning="toggleReasoning"
          @toggle-speech="toggleMessageSpeech"
          @update-editing-draft="editingDraft = $event"
        />

        <!-- 常用模板和输入器在滚动消息区之外，避免随消息一起滚动。 -->
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
            :is-listening="isListening"
            placeholder="给 AI Chat 发送消息"
            :responding="isResponding"
            :voice-input-supported="voiceInputSupported"
            :web-search="isWebSearch"
            @send="sendWithVoiceStop"
            @stop="stopResponding"
            @toggle-agent-mode="toggleAgentMode"
            @toggle-deep-thinking="toggleDeepThinking"
            @toggle-voice-input="toggleVoiceInput"
            @toggle-web-search="toggleWebSearch"
            @update-draft="draft = $event"
          />
        </div>
      </template>
    </section>

    <!-- 以下弹窗全部由应用根节点托管，避免受内容区层级和 overflow 影响。 -->
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
    <!-- 清空上下文只影响后续 API 请求，不删除页面历史。 -->
    <ContextClearDialog
      :open="isContextClearOpen"
      :title="activeSession?.title ?? '当前对话'"
      @close="closeContextClearDialog"
      @confirm="clearCurrentContext"
    />
    <!-- 收藏、模板、导出和设置均采用受控组件模式。 -->
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
      :custom-instructions="draftCustomInstructions"
      :draft-memory="draftMemory"
      :memories="draftMemories"
      :model-settings="draftModelSettings"
      :open="isSettingsOpen"
      :profile-name="draftProfileName"
      :theme-mode="draftThemeMode"
      @avatar-upload="handleAvatarUpload"
      @add-memory="addDraftMemory"
      @close="closeSettings"
      @remove-memory="removeDraftMemory"
      @save="saveSettings"
      @update-custom-instructions="draftCustomInstructions = $event"
      @update-draft-memory="draftMemory = $event"
      @update-model-settings="draftModelSettings = $event"
      @update-profile-name="draftProfileName = $event"
      @update-theme-mode="draftThemeMode = $event"
    />
    <ConversationManagerDialog
      :archived-count="archivedConversations.length"
      :items="managedConversationItems"
      :mode="conversationManagerMode"
      :open="isConversationManagerOpen"
      :trash-count="trashedConversations.length"
      @close="closeConversationManager"
      @remove="removeManagedConversation"
      @restore="restoreManagedConversation"
      @trash="trashManagedConversation"
      @update-mode="conversationManagerMode = $event"
    />
    <!-- 项目和会话的创建、重命名、删除共用此确认弹窗。 -->
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
import ConversationManagerDialog from '@/components/dialogs/ConversationManagerDialog.vue'
import ExportDialog from '@/components/dialogs/ExportDialog.vue'
import FavoritesDialog from '@/components/dialogs/FavoritesDialog.vue'
import SettingsDialog from '@/components/dialogs/SettingsDialog.vue'
import TemplateManagerDialog from '@/components/dialogs/TemplateManagerDialog.vue'
import { useChatApp } from '@/composables/useChatApp'
import { useSpeechFeatures } from '@/composables/useSpeechFeatures'

// App.vue 只负责页面组装；聊天业务和状态集中在 useChatApp 中。
const {
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
  isConversationManagerOpen,
  conversationManagerMode,
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
  draftCustomInstructions,
  draftMemories,
  draftMemory,
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
  archivedConversations,
  favoriteResults,
  renderedMessages,
  hiddenMessageCount,
  favoriteScopeOptions,
  filteredFavoriteResults,
  messageNavigatorItems,
  managedConversationItems,
  exportableMessages,
  selectedExportMessages,
  savedAvatarDisplay,
  updateActiveMessageFromScroll,
  jumpToMessage,
  loadEarlierMessages,
  copyRenderedCode,
  getReasoningContent,
  getAnswerContent,
  getBranchSwitcher,
  selectBranch,
  copyMessage,
  toggleMessageFavorite,
  switchFromFavorite,
  openFavoritesManager,
  openConversationManager,
  closeFavoritesManager,
  closeConversationManager,
  removeFavorite,
  removeManagedConversation,
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
  restoreManagedConversation,
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
  continueAssistantMessage,
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
  archiveSession,
  trashManagedConversation,
  trashedConversations,
  deleteSession,
  closeActionDialog,
  confirmActionDialog,
  handleAvatarUpload,
  openSettings,
  saveSettings,
  closeSettings,
  addDraftMemory,
  removeDraftMemory,
  formatTime,
} = useChatApp()

// 语音依赖浏览器 API，单独组合以免继续扩大聊天编排层。
const {
  isListening,
  speechPlaybackState,
  speechSynthesisSupported,
  spokenMessageId,
  stopSpeaking,
  stopVoiceInput,
  toggleMessageSpeech,
  toggleVoiceInput,
  voiceInputSupported,
} = useSpeechFeatures({
  draft,
  getMessageText: getAnswerContent,
})

const sendWithVoiceStop = () => {
  // 发送前停止识别，避免新的转写结果继续改动已提交的草稿。
  stopVoiceInput()
  send()
}

const sendProjectMessageWithVoiceStop = () => {
  stopVoiceInput()
  sendProjectMessage()
}
</script>
