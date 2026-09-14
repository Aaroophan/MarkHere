import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@markhere/preview-renderer/styles.css'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
