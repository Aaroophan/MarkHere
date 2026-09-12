import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const desktopRoot = fileURLToPath(new URL('.', import.meta.url))
const internalMainPackages = [
  '@markhere/document-model',
  '@markhere/ipc-contract',
  '@markhere/security-core',
  '@markhere/shared'
]

export default defineConfig({
  main: {
    build: {
      // Workspace packages currently export TypeScript source. Bundle them into
      // the Electron main artifact rather than leaving runtime .ts imports.
      externalizeDeps: {
        exclude: internalMainPackages
      },
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(desktopRoot, 'src/main/index.ts')
      }
    }
  },
  preload: {
    build: {
      // Electron's sandboxed preload has only a limited require() surface.
      // Fully bundle all non-Electron dependencies into one CommonJS preload.
      externalizeDeps: false,
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(desktopRoot, 'src/preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
          inlineDynamicImports: true
        }
      }
    }
  },
  renderer: {
    root: resolve(desktopRoot, 'src/renderer'),
    plugins: [vue()],
    build: {
      outDir: resolve(desktopRoot, 'out/renderer'),
      emptyOutDir: true
    }
  }
})
