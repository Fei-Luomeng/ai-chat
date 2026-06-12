<template>
  <!--
    Vue 3 模板会自动解包 ref：
    script 中的 isSidebarCollapsed 实际是 Ref<boolean>，
    但模板里直接使用 isSidebarCollapsed，不需要写 isSidebarCollapsed.value。
  -->
  <!-- 应用外壳：侧边栏、主对话区和全局弹窗都在这一层组装。 -->
  <main class="chat-shell" :class="{ 'sidebar-collapsed': isSidebarCollapsed, 'theme-dark': themeMode === 'dark' }">
    <!--
      冒号 : 是 v-bind: 的缩写，表示把 JavaScript 表达式传给子组件。
      例如 :projects="projects" 传递的是数组；不加冒号则会传递普通字符串。
      @ 是 v-on: 的缩写，子组件 emit 对应事件后，父组件在这里接收。
    -->
    <!-- 左侧导航只展示数据并上抛操作，具体状态修改由 useChatApp 完成。 -->
    <!--
      下面 active-session-id 这一行可以拆成三步理解：

      1. isProjectMode ? '' : xxx
         这是三元运算符，条件为 true 时取冒号前的 ''，否则取冒号后的 xxx。

      2. activeSession?.id
         ?. 是“可选链”，可以理解为先判断 activeSession 有没有值：

         - activeSession 有值：继续读取 activeSession.id。
         - activeSession 是 null 或 undefined：停止读取，不会因为访问 id 而报错，
           整个 activeSession?.id 表达式直接得到 undefined。

         注意：如果 activeSession 对象存在，但它的 id 本身是 null 或 undefined，
         activeSession?.id 最终同样会得到 null 或 undefined。

      3. activeSession?.id ?? ''
         ?? 是“空值合并运算符”，它会检查左侧最终得到的值：

         - 左侧是正常的会话 id，例如 'session-123'：直接使用这个 id。
         - 左侧是 null 或 undefined：使用右侧的默认值空字符串 ''。

         因此 activeSession?.id ?? '' 可以理解为：
         “如果 activeSession 存在并且能取到 id，就使用 id；否则使用空字符串。”

         它大致等价于下面的普通 if/else：

         let sessionId = ''
         if (activeSession !== null && activeSession !== undefined) {
           if (activeSession.id !== null && activeSession.id !== undefined) {
             sessionId = activeSession.id
           }
         }

         再加上最外层三元运算符后，完整含义是：
         - 当前是项目模式：直接传空字符串，不读取普通会话 id。
         - 当前不是项目模式：有 activeSession.id 就传 id，没有就传空字符串。

      ?? 和 || 不完全一样：
      0 ?? 10 得到 0，'' ?? '默认值' 得到 ''；
      0 || 10 得到 10，'' || '默认值' 得到 '默认值'。
      只有确实想处理 null/undefined 时，优先使用 ??。
    -->
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

    <!--
      移动端侧栏打开时显示一层覆盖主内容区的透明遮罩。
      用户点击侧栏外部区域后把 isSidebarCollapsed 设为 true，从而关闭侧栏；
      这是一个没有可见文字的按钮，aria-label 用于告诉读屏软件它的作用。
    -->
    <button
      v-if="isMobileViewport && !isSidebarCollapsed"
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭侧边栏"
      @click="isSidebarCollapsed = true"
    />

    <!--
      主内容区按“项目首页 / 空会话 / 当前会话至少有一条消息”三种状态切换。
      v-if、v-else-if、v-else 必须相邻，Vue 每次只会挂载其中一个分支。
      被切走的组件会卸载，因此组件里的 onBeforeUnmount 也会执行。
    -->
    <section class="conversation">
      <!--
        ConversationHeader 是“当前对话顶部栏”组件，文件位置：
        src/components/chat/ConversationHeader.vue

        下面以冒号 : 开头的是传给 ConversationHeader 的 props（属性）：
        左边是子组件 ConversationHeader 声明的属性名，
        右边是父组件 App.vue 从 useChatApp() 中取得的状态或计算结果。

        下面以 @ 开头的是监听 ConversationHeader 发出的事件：
        左边是子组件通过 emit 发出的事件名，
        右边是 App.vue 收到事件后执行的状态修改或 useChatApp() 方法。

        注意：Vue 组件开始标签的属性行末不能直接追加 HTML 注释，
        否则会造成模板语法错误，所以在这里按代码顺序逐行解释。

        props 属性逐行说明：

        1. :context-cleared="Boolean(activeSession?.contextClearedAt)"
           左边 context-cleared：
           是 ConversationHeader 的 contextCleared 属性，子组件中类型为 boolean。

           右边 activeSession：
           来自 useChatApp()，表示当前正在查看的普通会话或项目会话。

           activeSession?.contextClearedAt：
           `?.` 是可选链。有当前会话时读取“清空上下文的时间戳”；
           没有当前会话时不报错，而是得到 undefined。

           Boolean(...)：
           把时间戳或 undefined 转成真正的布尔值。
           有清空时间戳时得到 true，顶栏显示“已清上下文”；
           没有时间戳时得到 false，顶栏显示“清上下文”。

        2. :has-messages="Boolean(activeSession?.messages.length)"
           左边 has-messages 是 ConversationHeader 的 hasMessages 布尔属性。
           右边读取当前会话的消息数量：数量大于 0 转成 true，没有会话或消息为 0 转成 false。
           子组件根据它决定“查当前”和“导出”按钮是否可点击。

        3. :is-mobile-viewport="isMobileViewport"
           左边是子组件的 isMobileViewport 属性；
           右边来自 useChatApp()，表示当前是否为移动端宽度。
           子组件据此决定展开侧栏时使用 Menu 图标还是桌面端图标。

        4. :is-project-mode="isProjectMode"
           左边是子组件的 isProjectMode 属性；
           右边来自 useChatApp() 的 computed，表示当前是否处于某个项目中。
           true 时顶栏显示“项目 + 项目名”，false 时显示“AI Chat + 会话标题”。

        5. :is-responding="isResponding"
           左边是子组件的 isResponding 属性；
           右边来自 useChatApp()，表示普通会话或项目会话是否正在生成回答。
           正在生成时，顶栏的“清上下文”按钮会被禁用。

        6. :project-name="activeProject"
           左边是子组件的 projectName 字符串属性；
           右边 activeProject 来自 useChatApp()，保存当前项目名称。
           只有项目模式下，子组件才把它显示为顶栏标题。

        7. :session-title="headerSessionTitle"
           左边是子组件的 sessionTitle 字符串属性；
           右边 headerSessionTitle 来自 useChatApp() 的 computed，
           有活动会话时取会话标题，没有时使用“新的对话”。

        8. :sidebar-collapsed="isSidebarCollapsed"
           左边是子组件的 sidebarCollapsed 布尔属性；
           右边来自 useChatApp()，表示左侧栏当前是否收起。
           true 时 ConversationHeader 才显示“展开侧栏”按钮。

        子组件事件逐行说明：

        9. @clear-context="openContextClearDialog"
           ConversationHeader 点击“清上下文”后 emit('clearContext')；
           App.vue 收到后执行 useChatApp() 提供的 openContextClearDialog，
           打开确认弹窗，不会在第一次点击时直接清空。

        10. @import-session="importMarkdownSession"
            子组件选择导入文件后，把原生 change 事件作为参数发给父组件；
            App.vue 调用 useChatApp() 的 importMarkdownSession 读取并导入 Markdown 对话。

        11. @open-export="openExportDialog"
            子组件点击“导出”后通知父组件；
            App.vue 调用 useChatApp() 的 openExportDialog 打开导出设置弹窗。

        12. @open-session-search="openSessionSearch"
            子组件点击“查当前”后通知父组件；
            App.vue 调用 useChatApp() 的 openSessionSearch 打开当前会话搜索弹窗。

        13. @open-sidebar="isSidebarCollapsed = false"
            子组件点击展开侧栏按钮后 emit('openSidebar')；
            App.vue 直接把 useChatApp() 返回的 isSidebarCollapsed 改成 false，
            false 表示侧栏不再处于收起状态，因此左侧栏重新显示。
      -->
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
        <!--
          进入这个 v-else，表示前面的两个条件都不成立：

          1. `isProjectMode && isProjectHome` 为 false，不是在项目首页；
          2. `isFreshSession` 为 false，不是临时新建状态，并且当前会话消息数不为 0。

          因此这里更准确的含义是“已经进入一条至少包含一条消息的具体会话”，
          页面会渲染 MessageThread 消息流，以及底部固定的模板栏和输入器。

          template 本身不会生成真实 DOM，只用于把这些节点放进同一个 v-else 分支。
        -->
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
        <!--
          $event 表示子组件 emit 时携带的参数。
          messageAreaReady 发出 HTMLElement，父级把它保存到 messagesRef，
          之后 useChatApp 才能控制消息区域的滚动位置。
        -->

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
    <!--
      这些 update-* 事件等价于自定义 v-model：
      子组件不直接修改 prop，而是把新值交回父组件保存。
    -->
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
    <!--
      上面的 && 是短路判断：只有 actionDialog 不是 null 时才修改 value。
      模板已经自动解包外层 ref，所以 actionDialog.value 指的是弹窗对象的 value 字段，
      不是 Ref 自身的 .value。
    -->
  </main>
</template>

<script setup lang="ts">
// ChatComposer：底部聊天输入器，负责输入文字、切换工具以及发送/停止按钮。
import ChatComposer from '@/components/chat/ChatComposer.vue'
// ChatSidebar：左侧导航栏，展示项目、最近会话、收藏入口和用户设置入口。
import ChatSidebar from '@/components/chat/ChatSidebar.vue'
// ConversationHeader：对话区域顶部栏，展示标题以及搜索、导入、导出、清除上下文等操作。
import ConversationHeader from '@/components/chat/ConversationHeader.vue'
// MessageThread：消息列表主体，展示用户/助手消息、思考过程、引用来源和消息操作按钮。
import MessageThread from '@/components/chat/MessageThread.vue'
// ProjectHome：项目首页，展示项目说明、项目内会话列表和项目专用输入区。
import ProjectHome from '@/components/chat/ProjectHome.vue'
// PromptTemplateBar：常用提示词快捷栏，点击模板后把预设文字填入输入框。
import PromptTemplateBar from '@/components/chat/PromptTemplateBar.vue'
// SearchDialogs：同时承载全局搜索和当前会话内搜索两个弹窗。
import SearchDialogs from '@/components/chat/SearchDialogs.vue'
// WelcomeView：没有打开具体会话时的欢迎页，组合欢迎文案、模板栏和输入器。
import WelcomeView from '@/components/chat/WelcomeView.vue'

// ActionDialog：创建、重命名、删除项目或会话时使用的通用确认弹窗。
import ActionDialog from '@/components/dialogs/ActionDialog.vue'
// ContextClearDialog：确认“从此处开始清除上下文”的提示弹窗。
import ContextClearDialog from '@/components/dialogs/ContextClearDialog.vue'
// ConversationManagerDialog：归档与回收站管理弹窗，用于恢复或彻底处理会话。
import ConversationManagerDialog from '@/components/dialogs/ConversationManagerDialog.vue'
// ExportDialog：选择导出全部消息或部分消息的弹窗。
import ExportDialog from '@/components/dialogs/ExportDialog.vue'
// FavoritesDialog：查看、搜索、跳转和取消收藏消息的弹窗。
import FavoritesDialog from '@/components/dialogs/FavoritesDialog.vue'
// SettingsDialog：个人资料、主题、模型参数、自定义指令和记忆设置弹窗。
import SettingsDialog from '@/components/dialogs/SettingsDialog.vue'
// TemplateManagerDialog：新增、编辑、删除和恢复默认提示词模板的弹窗。
import TemplateManagerDialog from '@/components/dialogs/TemplateManagerDialog.vue'

// useChatApp：应用的主逻辑入口，集中组合会话、项目、搜索、设置等状态和操作。
import { useChatApp } from '@/composables/useChatApp'
// useSpeechFeatures：封装消息朗读和麦克风语音输入功能。
import { useSpeechFeatures } from '@/composables/useSpeechFeatures'

// <script setup> 会在每个组件实例创建时执行一次。
// 顶层导入的组件会自动注册，顶层变量和函数会自动提供给模板，
// 因此不需要 Vue 2 的 components、data、computed、methods 配置，也不通过 this 访问。
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
// 这里解构出来的大多是 ref/computed。脚本中修改 ref 要使用 .value，
// 模板会自动解包，所以模板里可以直接写 draft、isSettingsOpen 等名称。
// composable 返回的是 Ref 对象本身，解构不会丢失响应式；
// 需要注意的是，如果解构的是 reactive 普通对象字段，才可能需要 toRefs 保持响应式。

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
  // 直接把 draft 这个 Ref 传入，语音模块修改 draft.value 后，
  // App.vue 和所有使用同一 draft 的输入组件都会立即得到新值。
  draft,
  getMessageText: getAnswerContent,
})

const sendWithVoiceStop = () => {
  // 发送前停止识别，避免新的转写结果继续改动已提交的草稿。
  stopVoiceInput()
  // send 是 async 函数，但点击事件不需要等待其返回值，因此这里直接调用。
  send()
}

const sendProjectMessageWithVoiceStop = () => {
  stopVoiceInput()
  sendProjectMessage()
}
</script>
