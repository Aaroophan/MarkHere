import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@markhere/preview-renderer/styles.css'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.config.errorHandler = (_error, instance) => {
  const component = instance?.$options?.name
  void window.markhere.diagnostics.reportRendererFault({ kind: 'vue', ...(typeof component === 'string' ? { component } : {}) })
}
window.addEventListener('error', () => { void window.markhere.diagnostics.reportRendererFault({ kind: 'window-error' }) })
window.addEventListener('unhandledrejection', () => { void window.markhere.diagnostics.reportRendererFault({ kind: 'unhandled-rejection' }) })
app.mount('#app')
