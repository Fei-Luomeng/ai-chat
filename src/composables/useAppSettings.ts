import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'

import type { MemoryItem, ModelSettings } from '@/types/ui'

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  // maxTokens=0 代表请求层自动估算。
  defaultAgentMode: false,
  defaultDeepThinking: false,
  defaultWebSearch: false,
  maxTokens: 0,
  temperature: 1,
}

interface SettingsOptions {
  // 所有字段均可缺省，以便兼容旧版本 localStorage。
  avatarImage?: string
  closeMobileSidebar: () => void
  modelSettings?: Partial<ModelSettings>
  customInstructions?: string
  memories?: MemoryItem[]
  profileName?: string
  storedAgentMode?: boolean
  storedWebSearch?: boolean
  themeMode?: 'light' | 'dark'
}

export const useAppSettings = (options: SettingsOptions) => {
  // 已保存值和弹窗草稿分离，关闭弹窗即可无副作用地放弃修改。
  const initialSettings = { ...DEFAULT_MODEL_SETTINGS, ...(options.modelSettings ?? {}) }
  const modelSettings = ref<ModelSettings>(initialSettings)
  const draftModelSettings = ref<ModelSettings>({ ...initialSettings })
  const customInstructions = ref(options.customInstructions ?? '')
  // draft* 仅供设置弹窗编辑，保存前不影响真实请求。
  const draftCustomInstructions = ref(customInstructions.value)
  const memories = ref<MemoryItem[]>(options.memories?.map((item) => ({ ...item })) ?? [])
  const draftMemories = ref<MemoryItem[]>(memories.value.map((item) => ({ ...item })))
  const draftMemory = ref('')
  const isDeepThinking = ref(initialSettings.defaultDeepThinking)
  // Agent 和联网开关额外读取独立工具状态，保留用户最近一次选择。
  const isAgentMode = ref(Boolean(options.storedAgentMode ?? initialSettings.defaultAgentMode))
  const isWebSearch = ref(Boolean(options.storedWebSearch ?? initialSettings.defaultWebSearch))
  const isSettingsOpen = ref(false)
  const profileName = ref(options.profileName ?? 'Feather Mask')
  const profileAvatar = ref(profileName.value.slice(0, 2).toUpperCase() || 'FM')
  const draftProfileName = ref(profileName.value)
  const avatarImage = ref(options.avatarImage ?? '')
  const themeMode = ref<'light' | 'dark'>(options.themeMode ?? 'light')
  const draftThemeMode = ref<'light' | 'dark'>(themeMode.value)
  const savedAvatarDisplay = computed(() => profileAvatar.value.trim().slice(0, 2).toUpperCase() || 'U')

  const persistToolState = () => {
    // 深度思考不跨页面持久化；Agent 和联网开关保留最近状态。
    try {
      window.localStorage?.setItem(
        'ai-chat:tool-state',
        JSON.stringify({ agentMode: isAgentMode.value, webSearch: isWebSearch.value }),
      )
    } catch {
      // Tool state persistence is best-effort only.
    }
  }

  const toggleDeepThinking = () => {
    // 该开关只影响下一次发送，不立即触发请求。
    isDeepThinking.value = !isDeepThinking.value
  }

  const toggleAgentMode = () => {
    isAgentMode.value = !isAgentMode.value
    persistToolState()
  }

  const toggleWebSearch = () => {
    isWebSearch.value = !isWebSearch.value
    persistToolState()
  }

  const handleAvatarUpload = (event: Event) => {
    // 当前仅做本地预览，刷新后的持久化由应用状态快照负责。
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) avatarImage.value = URL.createObjectURL(file)
  }

  const openSettings = () => {
    // 打开时从已保存值重新创建草稿，抹掉上次未保存修改。
    draftProfileName.value = profileName.value
    draftThemeMode.value = themeMode.value
    draftModelSettings.value = { ...modelSettings.value }
    draftCustomInstructions.value = customInstructions.value
    draftMemories.value = memories.value.map((item) => ({ ...item }))
    draftMemory.value = ''
    isSettingsOpen.value = true
    options.closeMobileSidebar()
  }

  const saveSettings = () => {
    // 在保存边界统一做类型转换和范围限制，输入组件无需重复校验。
    profileName.value = draftProfileName.value.trim() || '用户'
    profileAvatar.value = profileName.value.slice(0, 2).toUpperCase()
    themeMode.value = draftThemeMode.value
    modelSettings.value = {
      defaultAgentMode: Boolean(draftModelSettings.value.defaultAgentMode),
      defaultDeepThinking: Boolean(draftModelSettings.value.defaultDeepThinking),
      defaultWebSearch: Boolean(draftModelSettings.value.defaultWebSearch),
      maxTokens: Math.max(0, Math.min(8192, Math.round(Number(draftModelSettings.value.maxTokens) || 0))),
      temperature: Math.max(0, Math.min(2, Number(draftModelSettings.value.temperature) || 0)),
    }
    customInstructions.value = draftCustomInstructions.value.trim()
    memories.value = draftMemories.value
      .map((item) => ({ ...item, content: item.content.trim() }))
      .filter((item) => item.content)
    // 保存默认值后立即同步当前工具状态，使下一条消息直接生效。
    isAgentMode.value = modelSettings.value.defaultAgentMode
    isDeepThinking.value = modelSettings.value.defaultDeepThinking
    isWebSearch.value = modelSettings.value.defaultWebSearch
    persistToolState()
    isSettingsOpen.value = false
    ElMessage.success('设置已保存')
  }

  const closeSettings = () => {
    // 取消和点击外部关闭都走同一回滚流程。
    draftThemeMode.value = themeMode.value
    draftModelSettings.value = { ...modelSettings.value }
    draftCustomInstructions.value = customInstructions.value
    draftMemories.value = memories.value.map((item) => ({ ...item }))
    draftMemory.value = ''
    isSettingsOpen.value = false
  }

  const addDraftMemory = () => {
    // 新记忆先进入弹窗草稿，只有保存设置后才进入真实 memories。
    const content = draftMemory.value.trim()
    if (!content) return
    draftMemories.value.push({ id: crypto.randomUUID(), content })
    draftMemory.value = ''
  }

  const removeDraftMemory = (memoryId: string) => {
    // 删除同样只修改草稿数组。
    draftMemories.value = draftMemories.value.filter((item) => item.id !== memoryId)
  }

  return {
    avatarImage,
    addDraftMemory,
    closeSettings,
    customInstructions,
    draftCustomInstructions,
    draftMemories,
    draftMemory,
    draftModelSettings,
    draftProfileName,
    draftThemeMode,
    handleAvatarUpload,
    isAgentMode,
    isDeepThinking,
    isSettingsOpen,
    isWebSearch,
    modelSettings,
    memories,
    openSettings,
    persistToolState,
    profileName,
    removeDraftMemory,
    saveSettings,
    savedAvatarDisplay,
    themeMode,
    toggleAgentMode,
    toggleDeepThinking,
    toggleWebSearch,
  }
}
