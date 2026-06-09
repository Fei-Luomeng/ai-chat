import { ElMessage } from 'element-plus'
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

import type { ChatMessage } from '@/stores/chat'

type SpeechPlaybackState = 'idle' | 'paused' | 'speaking'

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
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
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onstart: (() => void) | null
  abort: () => void
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

interface UseSpeechFeaturesOptions {
  draft: Ref<string>
  getMessageText: (message: ChatMessage) => string
}

const normalizeSpeechText = (content: string) =>
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
  const speechPlaybackState = ref<SpeechPlaybackState>('idle')
  const spokenMessageId = ref('')
  const isListening = ref(false)
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

  let recognition: SpeechRecognitionLike | null = null
  let recognitionBaseDraft = ''
  let activeUtterance: SpeechSynthesisUtterance | null = null

  const resetSpeechPlayback = () => {
    speechPlaybackState.value = 'idle'
    spokenMessageId.value = ''
    activeUtterance = null
  }

  const stopSpeaking = () => {
    if (!speechSynthesisSupported.value) return
    window.speechSynthesis.cancel()
    resetSpeechPlayback()
  }

  const toggleMessageSpeech = (message: ChatMessage) => {
    if (!speechSynthesisSupported.value) {
      ElMessage.info('当前浏览器不支持朗读')
      return
    }

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

    stopSpeaking()
    const utterance = new SpeechSynthesisUtterance(content)
    utterance.lang = 'zh-CN'
    utterance.rate = 1
    utterance.pitch = 1
    utterance.voice =
      window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('zh')) ??
      null
    utterance.onstart = () => {
      spokenMessageId.value = message.id
      speechPlaybackState.value = 'speaking'
    }
    utterance.onpause = () => {
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

    try {
      recognition.stop()
    } catch {
      recognition.abort()
    }
    recognition = null
    isListening.value = false
  }

  const toggleVoiceInput = () => {
    if (isListening.value) {
      stopVoiceInput()
      return
    }

    const Recognition =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition
    if (!Recognition) {
      ElMessage.info('当前浏览器不支持语音输入，请使用最新版 Chrome 或 Edge')
      return
    }

    recognitionBaseDraft = options.draft.value.trimEnd()
    const nextRecognition = new Recognition()
    recognition = nextRecognition
    nextRecognition.lang = 'zh-CN'
    nextRecognition.continuous = true
    nextRecognition.interimResults = true
    nextRecognition.maxAlternatives = 1
    nextRecognition.onstart = () => {
      isListening.value = true
    }
    nextRecognition.onresult = (event) => {
      let transcript = ''
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? ''
      }

      const separator = recognitionBaseDraft && transcript ? ' ' : ''
      options.draft.value = `${recognitionBaseDraft}${separator}${transcript}`.trimStart()
    }
    nextRecognition.onerror = (event) => {
      recognition = null
      isListening.value = false
      if (event.error === 'aborted' || event.error === 'no-speech') return

      const message =
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? '未获得麦克风权限，请在浏览器设置中允许访问'
          : event.error === 'audio-capture'
            ? '没有检测到可用麦克风'
            : '语音识别失败，请稍后重试'
      ElMessage.error(message)
    }
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
    recognition?.abort()
    recognition = null
    stopSpeaking()
  })

  watch(options.draft, (value, previousValue) => {
    if (isListening.value && previousValue && !value) stopVoiceInput()
  })

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
