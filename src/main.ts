import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import './styles/main.css'

// createApp 创建应用实例；use 按顺序安装全局插件；mount 把应用挂载到 index.html 的 #app。
// 这一条调用链等价于先保存 app 变量，再逐步执行 app.use(...) 和 app.mount(...)。
// 全局只注册状态容器和 Element Plus，业务依赖在各组件内按需导入。
createApp(App).use(createPinia()).use(ElementPlus).mount('#app')
