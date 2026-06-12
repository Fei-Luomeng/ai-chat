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
  // interface 中每一行的格式通常是“字段名: 字段类型”。
  // 函数字段 `closeMobileSidebar: () => void` 表示调用者必须传入一个无参数函数。
  // 所有字段均可缺省，以便兼容旧版本 localStorage。
  // Partial<ModelSettings> 会把 ModelSettings 的每个字段都变成可选字段，
  // 这样旧数据缺少后来新增的设置项时也能正常读取。
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
  // 参数后的 `: SettingsOptions` 约束调用这个函数时必须传入什么结构。
  // 此处没有手写返回值类型，TS 会根据最后 return 的对象自动推断，通常比重复声明更易维护。
  // 已保存值和弹窗草稿分离，关闭弹窗即可无副作用地放弃修改。
  // 对象使用展开语法复制，避免编辑 draft 时和已保存对象共享同一个引用。
  const initialSettings = { ...DEFAULT_MODEL_SETTINGS, ...(options.modelSettings ?? {}) }
  // modelSettings 是已经保存并真正参与请求的值。
  // ref 是泛型函数，`<ModelSettings>` 约束 `.value` 必须始终符合完整的设置结构。
  // 这和 JS 的小于号/大于号无关；在这里尖括号用于传递“类型参数”。
  const modelSettings = ref<ModelSettings>(initialSettings)
  // draftModelSettings 是弹窗编辑副本；用户点击“取消”时不会污染真实设置。
  const draftModelSettings = ref<ModelSettings>({ ...initialSettings })
  const customInstructions = ref(options.customInstructions ?? '')
  // draft* 仅供设置弹窗编辑，保存前不影响真实请求。
  const draftCustomInstructions = ref(customInstructions.value)
  // 数组和每个 item 都复制一层，避免已保存值与弹窗草稿共享可变对象。
  // `MemoryItem[]` 是对象数组类型；`?.` 在 memories 不存在时停止调用 map，
  // 随后的 `?? []` 再提供空数组默认值。这两个问号相关语法只处理 null/undefined。
  const memories = ref<MemoryItem[]>(options.memories?.map((item) => ({ ...item })) ?? [])
  const draftMemories = ref<MemoryItem[]>(memories.value.map((item) => ({ ...item })))
  const draftMemory = ref('')
  const isDeepThinking = ref(initialSettings.defaultDeepThinking)
  // Agent 和联网开关额外读取独立工具状态，保留用户最近一次选择。
  const isAgentMode = ref(Boolean(options.storedAgentMode ?? initialSettings.defaultAgentMode))
  const isWebSearch = ref(Boolean(options.storedWebSearch ?? initialSettings.defaultWebSearch))
  const isSettingsOpen = ref(false)
  const profileName = ref(options.profileName ?? 'Feather Mask')
  // 没有上传图片时，用用户名前两个字符生成文字头像。
  const profileAvatar = ref(profileName.value.slice(0, 2).toUpperCase() || 'FM')
  const draftProfileName = ref(profileName.value)
  const avatarImage = ref(options.avatarImage ?? '')
  const themeMode = ref<'light' | 'dark'>(options.themeMode ?? 'light')
  const draftThemeMode = ref<'light' | 'dark'>(themeMode.value)
  // 展示文字完全由 profileAvatar 派生，因此用 computed 而不是再维护一个 ref。
  const savedAvatarDisplay = computed(() => profileAvatar.value.trim().slice(0, 2).toUpperCase() || 'U')

  const persistToolState = () => {
    // 深度思考不跨页面持久化；Agent 和联网开关保留最近状态。
    try {
      // localStorage 只能保存字符串，所以先把普通对象 JSON.stringify。
      window.localStorage?.setItem(
        'ai-chat:tool-state',
        JSON.stringify({ agentMode: isAgentMode.value, webSearch: isWebSearch.value }),
      )
    } catch {
      // 隐私模式、存储配额不足等环境可能禁止写入；当前页面状态仍可继续使用。
    }
  }

  const toggleDeepThinking = () => {
    // 该开关只影响下一次发送，不立即触发请求。
    isDeepThinking.value = !isDeepThinking.value
  }

  const toggleAgentMode = () => {
    // 布尔值取反后立即持久化，刷新页面仍保留最近选择。
    isAgentMode.value = !isAgentMode.value
    persistToolState()
  }

  const toggleWebSearch = () => {
    isWebSearch.value = !isWebSearch.value
    persistToolState()
  }

  const handleAvatarUpload = (event: Event) => {
    // 当前仅做本地预览，刷新后的持久化由应用状态快照负责。
    // files 是 FileList，?.[0] 安全读取用户选择的第一张图片。
    // Event.target 的基础类型只保证它是 EventTarget，不知道它一定是 input。
    // `as HTMLInputElement` 告诉 TS 这里来自文件输入框，于是才能访问 files；
    // 断言不会做运行时校验，所以只应在我们确实知道元素类型时使用。
    const file = (event.target as HTMLInputElement).files?.[0]
    // createObjectURL 返回临时本地 URL，可直接作为 CSS background-image。
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
      // Number 统一把输入值转为数字；Math.min/Math.max 把结果限制在合法范围。
      maxTokens: Math.max(0, Math.min(8192, Math.round(Number(draftModelSettings.value.maxTokens) || 0))),
      temperature: Math.max(0, Math.min(2, Number(draftModelSettings.value.temperature) || 0)),
    }
    customInstructions.value = draftCustomInstructions.value.trim()
    // map 创建清洗后的新对象，filter 再移除空内容；不会原地改动弹窗中的数组项。
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
    // push 可以直接修改 ref 内的响应式数组，Vue 会追踪这次数组变化。
    draftMemories.value.push({ id: crypto.randomUUID(), content })
    draftMemory.value = ''
  }

  const removeDraftMemory = (memoryId: string) => {
    // 删除同样只修改草稿数组。
    draftMemories.value = draftMemories.value.filter((item) => item.id !== memoryId)
  }

  // 返回 Ref 本身而不是 .value，调用方才能继续保持响应式联系。
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
