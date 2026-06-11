# AI Chat

一个基于 Vue 3、TypeScript、Pinia、Element Plus 和 Vite 开发的 AI 对话系统。

## 系统功能

- 普通对话与项目对话
- 流式回答与深度思考展示
- Agent 模式与联网搜索
- 对话搜索、收藏、归档和回收站
- 消息编辑、重新生成和分支切换
- 提示词模板管理
- Markdown 导入与导出
- 语音输入与消息朗读
- 用户设置、主题、自定义指令和记忆
- 本地浏览器数据持久化

## 项目结构

```text
src/
├── components/     页面组件和弹窗组件
├── composables/    按功能拆分的状态与业务逻辑
├── stores/         Pinia 会话状态和接口请求
├── styles/         全局样式
├── types/          公共 TypeScript 类型
├── utils/          Markdown 等工具函数
├── App.vue         应用页面组装入口
└── main.ts         Vue 应用启动入口
```

## 本地运行

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
```
