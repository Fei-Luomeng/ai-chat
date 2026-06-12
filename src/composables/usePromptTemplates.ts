import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'

import type { PromptTemplate } from '@/types/ui'

const DEFAULT_TEMPLATES: PromptTemplate[] = [
  // 默认模板使用固定 id，用户恢复默认时可得到稳定 key。
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
  // draft 是 App.vue 的同一个输入框 Ref，模板模块可以直接向其中写入文本。
  // 模板列表直接持久化，编辑表单使用独立草稿避免输入时污染列表。
  // ?? 只在 initialTemplates 为 null/undefined 时使用默认模板；
  // 如果传入的是空数组，则尊重用户“没有模板”的状态。
  const promptTemplates = ref(initialTemplates ?? DEFAULT_TEMPLATES)
  const isTemplateManagerOpen = ref(false)
  const editingTemplateId = ref('')
  const draftTemplateLabel = ref('')
  const draftTemplatePrompt = ref('')

  const resetTemplateDraft = () => {
    // editingTemplateId 为空代表表单处于新增模式。
    editingTemplateId.value = ''
    draftTemplateLabel.value = ''
    draftTemplatePrompt.value = ''
  }

  const applyPromptTemplate = (template: PromptTemplate) => {
    // 保留用户已输入内容，模板作为下一段追加而不是覆盖。
    const currentDraft = draft.value.trim()
    // 已有内容时用两个换行分隔；空输入框则直接放入模板正文。
    draft.value = currentDraft ? `${currentDraft}\n\n${template.prompt}` : template.prompt
  }

  const openTemplateManager = () => {
    // 每次打开从空白新增态开始，避免误修改上次选中的模板。
    resetTemplateDraft()
    isTemplateManagerOpen.value = true
  }

  const closeTemplateManager = () => {
    // 关闭时同时丢弃未保存表单内容。
    isTemplateManagerOpen.value = false
    resetTemplateDraft()
  }

  const editPromptTemplate = (template: PromptTemplate) => {
    // 复制字段到草稿，输入过程不会直接改列表对象。
    editingTemplateId.value = template.id
    draftTemplateLabel.value = template.label
    draftTemplatePrompt.value = template.prompt
  }

  const savePromptTemplate = () => {
    // 名称和正文都去除首尾空白后再校验。
    const label = draftTemplateLabel.value.trim()
    const prompt = draftTemplatePrompt.value.trim()
    if (!label || !prompt) {
      ElMessage.warning('模板名称和内容都要填写')
      return
    }
    if (editingTemplateId.value) {
      // 更新时创建新对象，确保模板条和管理列表立即刷新。
      // map 返回新数组；三元表达式只为命中的模板创建新对象，其他项保留原引用。
      promptTemplates.value = promptTemplates.value.map((template) =>
        template.id === editingTemplateId.value ? { ...template, label, prompt } : template,
      )
      ElMessage.success('模板已更新')
    } else {
      // 新模板置顶，便于用户立即使用。
      // 新建对象放在数组最前面，createId 保证 v-for key 唯一。
      promptTemplates.value = [{ id: `template-${createId()}`, label, prompt }, ...promptTemplates.value]
      ElMessage.success('模板已新增')
    }
    resetTemplateDraft()
  }

  const deletePromptTemplate = (templateId: string) => {
    // 删除正在编辑的模板后同步清空表单。
    promptTemplates.value = promptTemplates.value.filter((template) => template.id !== templateId)
    // 正在编辑的条目被删除时同步退出编辑态，避免表单指向不存在的数据。
    if (editingTemplateId.value === templateId) resetTemplateDraft()
    ElMessage.success('模板已删除')
  }

  const restoreDefaultTemplates = () => {
    // 复制默认对象，避免后续编辑污染模块级常量。
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
