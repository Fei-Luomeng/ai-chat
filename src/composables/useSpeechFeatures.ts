import { ElMessage } from 'element-plus'
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

import type { ChatMessage } from '@/stores/chat'

type SpeechPlaybackState = 'idle' | 'paused' | 'speaking'
// 这是字符串字面量联合类型：变量只能保存三个指定字符串之一，不能随便传入其他 string。

// SpeechRecognition 尚未稳定进入 TypeScript DOM 类型，并且 Chromium 仍可能只暴露 webkit 前缀。
interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  // 语音识别结果是“类数组”结构，因此用数字索引签名描述 result[0]。
  // `[index: number]: SpeechRecognitionAlternativeLike` 表示：
  // 使用任意数字下标读取该对象时，得到的值都应符合 SpeechRecognitionAlternativeLike。
  [index: number]: SpeechRecognitionAlternativeLike
  isFinal: boolean
  length: number
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: {
    [index: number]: SpeechRecognitionResultLike
    length: number
  }
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}

interface SpeechRecognitionLike {
  // 这里只声明项目实际使用的浏览器 API 字段，不需要完整复制浏览器规范。
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  // `() => void` 表示“无参数、无业务返回值的函数”；再和 null 联合，表示事件处理器也可以未设置。
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onstart: (() => void) | null
  abort: () => void
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
// `new () => T` 描述“可以用 new 调用的构造器”，new 之后会得到 T 类型实例。
// 因此后面拿到 Recognition 后，`new Recognition()` 的结果会被推断为 SpeechRecognitionLike。

type SpeechWindow = Window & {
  // 交叉类型表示“普通 Window 再额外拥有这两个可选字段”。
  // 联合类型 A | B 是“二选一”，交叉类型 A & B 则是“同时拥有两边的能力”。
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

interface UseSpeechFeaturesOptions {
  // Ref<string> 是 Vue 的泛型类型。尖括号中的 string 表示 `.value` 内保存的是字符串。
  // 把 Ref 本身传进 composable，里面修改 draft.value 时，调用它的组件也会同步看到变化。
  draft: Ref<string>
  // 这是函数类型：调用时必须传入 ChatMessage，返回值必须是 string。
  getMessageText: (message: ChatMessage) => string
}

const normalizeSpeechText = (content: string) =>
  // 朗读前去掉 Markdown 语法和引用编号，避免把星号、链接等符号读出来。
  // 每个 replace 依次删除一种 Markdown 标记，最后压缩空白并去除首尾空格。
  content
    .replace(/```[\s\S]*?```/g, '代码块。')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/【\s*(?:ref_?)?\d+\s*】/gi, '')
    .replace(/\[\s*(?:ref_?)?\d+\s*\]/gi, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)、]\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\n{2,}/g, '。')
    .replace(/\s+/g, ' ')
    .trim()

export const useSpeechFeatures = (options: UseSpeechFeaturesOptions) => {
  // 朗读和语音输入是两套独立浏览器 API，可以同时判断支持情况。
  // `ref<SpeechPlaybackState>` 中的 `<...>` 是泛型参数，明确限制该 ref 以后能保存哪些值。
  // 如果只写 ref('idle')，TS 可能把它理解成较宽的 string，无法完整表达三个合法状态。
  const speechPlaybackState = ref<SpeechPlaybackState>('idle')
  const spokenMessageId = ref('')
  const isListening = ref(false)
  // 浏览器能力也保存为 ref，让模板可以像使用普通状态一样进行 v-if 判断。
  const speechSynthesisSupported = ref(
    typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      'SpeechSynthesisUtterance' in window,
  )
  const voiceInputSupported = ref(
    typeof window !== 'undefined' &&
      Boolean(
        (window as SpeechWindow).SpeechRecognition ??
          (window as SpeechWindow).webkitSpeechRecognition,
      ),
  )

  // 这些变量不参与模板渲染，所以不需要 ref；普通 let 足够保存浏览器 API 实例。
  // 变量初始化时还没有识别实例，所以类型写成 `SpeechRecognitionLike | null`。
  // 使用 recognition 的属性前要排除 null；上面的 if (!recognition) 就是在做类型收窄。
  let recognition: SpeechRecognitionLike | null = null
  // 开始识别时记录已有草稿，临时转写始终追加在该基线之后。
  let recognitionBaseDraft = ''
  let activeUtterance: SpeechSynthesisUtterance | null = null

  const resetSpeechPlayback = () => {
    // 浏览器 cancel 不保证触发统一回调，因此主动重置本地状态。
    speechPlaybackState.value = 'idle'
    spokenMessageId.value = ''
    activeUtterance = null
  }

  const stopSpeaking = () => {
    // cancel 会清空浏览器当前朗读和排队中的所有 utterance。
    if (!speechSynthesisSupported.value) return
    window.speechSynthesis.cancel()
    resetSpeechPlayback()
  }

  const toggleMessageSpeech = (message: ChatMessage) => {
    if (!speechSynthesisSupported.value) {
      ElMessage.info('当前浏览器不支持朗读')
      return
    }

    // 点击当前消息在暂停/继续之间切换；点击其他消息则开始新的朗读。
    // 同一消息再次点击不重新创建任务，而是在 speaking/paused 间切换。
    if (spokenMessageId.value === message.id) {
      if (speechPlaybackState.value === 'speaking') {
        window.speechSynthesis.pause()
        speechPlaybackState.value = 'paused'
        return
      }

      if (speechPlaybackState.value === 'paused') {
        window.speechSynthesis.resume()
        speechPlaybackState.value = 'speaking'
        return
      }
    }

    const content = normalizeSpeechText(options.getMessageText(message))
    if (!content) return

    // 开始新消息前先停止旧任务，保证同时只有一条消息朗读。
    stopSpeaking()
    // SpeechSynthesisUtterance 表示一次朗读任务，事件回调用于同步页面按钮状态。
    const utterance = new SpeechSynthesisUtterance(content)
    utterance.lang = 'zh-CN'
    utterance.rate = 1
    utterance.pitch = 1
    // 优先中文音色，找不到时交给浏览器选择默认 voice。
    utterance.voice =
      window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('zh')) ??
      null
    // 浏览器回调可能晚于 speak 调用，因此回调里再次同步准确状态。
    utterance.onstart = () => {
      spokenMessageId.value = message.id
      speechPlaybackState.value = 'speaking'
    }
    utterance.onpause = () => {
      // 旧 utterance 的异步回调不能覆盖新一轮朗读状态。
      if (activeUtterance === utterance) speechPlaybackState.value = 'paused'
    }
    utterance.onresume = () => {
      if (activeUtterance === utterance) speechPlaybackState.value = 'speaking'
    }
    utterance.onend = () => {
      if (activeUtterance === utterance) resetSpeechPlayback()
    }
    utterance.onerror = (event) => {
      if (activeUtterance !== utterance) return
      resetSpeechPlayback()
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        ElMessage.error('朗读失败，请稍后重试')
      }
    }

    activeUtterance = utterance
    spokenMessageId.value = message.id
    speechPlaybackState.value = 'speaking'
    window.speechSynthesis.speak(utterance)
  }

  const stopVoiceInput = () => {
    if (!recognition) {
      isListening.value = false
      return
    }

    // 部分实现对重复 stop 抛错，此时使用 abort 强制结束。
    try {
      recognition.stop()
    } catch {
      recognition.abort()
    }
    // 清空实例引用，后续 onend 回调不会再把它当作当前识别任务。
    recognition = null
    isListening.value = false
  }

  const toggleVoiceInput = () => {
    if (isListening.value) {
      stopVoiceInput()
      return
    }

    // ?? 只在左侧为 null/undefined 时使用右侧，优先选择标准 API，再兼容 webkit 前缀。
    const Recognition =
      // `as SpeechWindow` 只扩充 TypeScript 对 window 的认识，不会真的给浏览器添加这些属性。
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition
    if (!Recognition) {
      ElMessage.info('当前浏览器不支持语音输入，请使用最新版 Chrome 或 Edge')
      return
    }

    // 保存识别开始前的文本，之后每次临时结果都基于它整体覆盖。
    recognitionBaseDraft = options.draft.value.trimEnd()
    const nextRecognition = new Recognition()
    recognition = nextRecognition
    nextRecognition.lang = 'zh-CN'
    // continuous 保持监听，interimResults 让输入框实时显示临时转写。
    nextRecognition.continuous = true
    nextRecognition.interimResults = true
    nextRecognition.maxAlternatives = 1
    nextRecognition.onstart = () => {
      isListening.value = true
    }
    nextRecognition.onresult = (event) => {
      let transcript = ''
      // 识别结果是类似数组的对象，每项的第 0 个候选通常是置信度最高的文本。
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? ''
      }

      const separator = recognitionBaseDraft && transcript ? ' ' : ''
      // 每次识别结果都可能包含完整临时文本，始终基于开始前草稿覆盖，避免重复追加。
      options.draft.value = `${recognitionBaseDraft}${separator}${transcript}`.trimStart()
    }
    nextRecognition.onerror = (event) => {
      recognition = null
      isListening.value = false
      // 主动停止和短暂无语音属于正常状态，不显示错误提示。
      if (event.error === 'aborted' || event.error === 'no-speech') return

      const message =
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? '未获得麦克风权限，请在浏览器设置中允许访问'
          : event.error === 'audio-capture'
            ? '没有检测到可用麦克风'
            : '语音识别失败，请稍后重试'
      ElMessage.error(message)
    }
    // 只有当前任务仍是 nextRecognition 时才清空，防止旧任务回调干扰新任务。
    nextRecognition.onend = () => {
      if (recognition === nextRecognition) recognition = null
      isListening.value = false
    }

    try {
      nextRecognition.start()
    } catch {
      recognition = null
      isListening.value = false
      ElMessage.error('语音输入启动失败，请稍后重试')
    }
  }

  onBeforeUnmount(() => {
    // 页面卸载时释放麦克风和系统朗读队列。
    recognition?.abort()
    recognition = null
    stopSpeaking()
  })

  watch(options.draft, (value, previousValue) => {
    // 直接监听 Ref 时，回调参数依次是新值和旧值，不需要写 () => options.draft.value。
    // 用户清空输入框视为取消本轮语音输入。
    if (isListening.value && previousValue && !value) stopVoiceInput()
  })

  // 浏览器实例和内部基线不暴露给组件，只返回模板需要的状态和控制函数。
  return {
    isListening,
    speechPlaybackState,
    speechSynthesisSupported,
    spokenMessageId,
    stopSpeaking,
    stopVoiceInput,
    toggleMessageSpeech,
    toggleVoiceInput,
    voiceInputSupported,
  }
}
