import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import './styles/main.css'

// 全局只注册状态容器和 Element Plus，业务依赖在各组件内按需导入。
createApp(App).use(createPinia()).use(ElementPlus).mount('#app')
