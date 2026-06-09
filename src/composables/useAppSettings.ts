import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'

import type { MemoryItem, ModelSettings } from '@/types/ui'

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  defaultAgentMode: false,
  defaultDeepThinking: false,
  defaultWebSearch: false,
  maxTokens: 0,
  temperature: 1,
}

interface SettingsOptions {
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
  const initialSettings = { ...DEFAULT_MODEL_SETTINGS, ...(options.modelSettings ?? {}) }
  const modelSettings = ref<ModelSettings>(initialSettings)
  const draftModelSettings = ref<ModelSettings>({ ...initialSettings })
  const customInstructions = ref(options.customInstructions ?? '')
  const draftCustomInstructions = ref(customInstructions.value)
  const memories = ref<MemoryItem[]>(options.memories?.map((item) => ({ ...item })) ?? [])
  const draftMemories = ref<MemoryItem[]>(memories.value.map((item) => ({ ...item })))
  const draftMemory = ref('')
  const isDeepThinking = ref(initialSettings.defaultDeepThinking)
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
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) avatarImage.value = URL.createObjectURL(file)
  }

  const openSettings = () => {
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
    isAgentMode.value = modelSettings.value.defaultAgentMode
    isDeepThinking.value = modelSettings.value.defaultDeepThinking
    isWebSearch.value = modelSettings.value.defaultWebSearch
    persistToolState()
    isSettingsOpen.value = false
    ElMessage.success('设置已保存')
  }

  const closeSettings = () => {
    draftThemeMode.value = themeMode.value
    draftModelSettings.value = { ...modelSettings.value }
    draftCustomInstructions.value = customInstructions.value
    draftMemories.value = memories.value.map((item) => ({ ...item }))
    draftMemory.value = ''
    isSettingsOpen.value = false
  }

  const addDraftMemory = () => {
    const content = draftMemory.value.trim()
    if (!content) return
    draftMemories.value.push({ id: crypto.randomUUID(), content })
    draftMemory.value = ''
  }

  const removeDraftMemory = (memoryId: string) => {
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
