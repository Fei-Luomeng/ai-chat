import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'

import type { PromptTemplate } from '@/types/ui'

const DEFAULT_TEMPLATES: PromptTemplate[] = [
  { id: 'explain-code', label: '解释代码', prompt: '请解释下面这段代码的作用、执行流程、关键语法点，并指出可能的优化点：\n\n' },
  { id: 'interview', label: '面试八股', prompt: '请用前端面试的方式回答这个问题：先给结论，再讲原理，然后给一个简短例子，最后补充常见追问。\n\n问题：' },
  { id: 'resume', label: '简历优化', prompt: '请帮我优化下面这段简历描述：要求更像真实项目经历，突出业务价值、技术难点和量化结果，不要夸张。\n\n' },
  { id: 'polish', label: '翻译润色', prompt: '请润色下面这段内容，让表达更自然、清晰、有礼貌。保留原意，不要过度扩写。\n\n' },
  { id: 'weekly', label: '生成周报', prompt: '请根据下面的工作记录生成一份简洁周报，包含：本周完成、问题风险、下周计划。\n\n' },
]

export const usePromptTemplates = (
  draft: Ref<string>,
  initialTemplates: PromptTemplate[] | undefined,
  createId: () => string,
) => {
  const promptTemplates = ref(initialTemplates ?? DEFAULT_TEMPLATES)
  const isTemplateManagerOpen = ref(false)
  const editingTemplateId = ref('')
  const draftTemplateLabel = ref('')
  const draftTemplatePrompt = ref('')

  const resetTemplateDraft = () => {
    editingTemplateId.value = ''
    draftTemplateLabel.value = ''
    draftTemplatePrompt.value = ''
  }

  const applyPromptTemplate = (template: PromptTemplate) => {
    const currentDraft = draft.value.trim()
    draft.value = currentDraft ? `${currentDraft}\n\n${template.prompt}` : template.prompt
  }

  const openTemplateManager = () => {
    resetTemplateDraft()
    isTemplateManagerOpen.value = true
  }

  const closeTemplateManager = () => {
    isTemplateManagerOpen.value = false
    resetTemplateDraft()
  }

  const editPromptTemplate = (template: PromptTemplate) => {
    editingTemplateId.value = template.id
    draftTemplateLabel.value = template.label
    draftTemplatePrompt.value = template.prompt
  }

  const savePromptTemplate = () => {
    const label = draftTemplateLabel.value.trim()
    const prompt = draftTemplatePrompt.value.trim()
    if (!label || !prompt) {
      ElMessage.warning('模板名称和内容都要填写')
      return
    }
    if (editingTemplateId.value) {
      promptTemplates.value = promptTemplates.value.map((template) =>
        template.id === editingTemplateId.value ? { ...template, label, prompt } : template,
      )
      ElMessage.success('模板已更新')
    } else {
      promptTemplates.value = [{ id: `template-${createId()}`, label, prompt }, ...promptTemplates.value]
      ElMessage.success('模板已新增')
    }
    resetTemplateDraft()
  }

  const deletePromptTemplate = (templateId: string) => {
    promptTemplates.value = promptTemplates.value.filter((template) => template.id !== templateId)
    if (editingTemplateId.value === templateId) resetTemplateDraft()
    ElMessage.success('模板已删除')
  }

  const restoreDefaultTemplates = () => {
    promptTemplates.value = DEFAULT_TEMPLATES.map((template) => ({ ...template }))
    resetTemplateDraft()
    ElMessage.success('已恢复默认模板')
  }

  return {
    applyPromptTemplate,
    closeTemplateManager,
    deletePromptTemplate,
    draftTemplateLabel,
    draftTemplatePrompt,
    editingTemplateId,
    editPromptTemplate,
    isTemplateManagerOpen,
    openTemplateManager,
    promptTemplates,
    resetTemplateDraft,
    restoreDefaultTemplates,
    savePromptTemplate,
  }
}
