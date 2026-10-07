import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const desktopRoot = fileURLToPath(new URL('.', import.meta.url))

const editorCoreRequire = createRequire(resolve(desktopRoot, '../../packages/editor-core/package.json'))

function resolveMuyaStyle(): string {
  const muyaEntry = editorCoreRequire.resolve('@muyajs/core')
  const packageRoot = resolve(dirname(muyaEntry), '../..')
  const libDirectory = resolve(packageRoot, 'lib')
  const documentedPath = resolve(libDirectory, 'style.css')
  if (existsSync(documentedPath)) return documentedPath

  const cssCandidates: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(entryPath)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.css')) cssCandidates.push(entryPath)
    }
  }
  visit(libDirectory)

  const preferred = cssCandidates.find((candidate) => /(?:^|[\\/])style\.css$/iu.test(candidate))
    ?? cssCandidates.find((candidate) => /(?:^|[\\/])index\.css$/iu.test(candidate))
  if (preferred) return preferred
  if (cssCandidates.length === 1 && cssCandidates[0]) return cssCandidates[0]

  throw new Error(`Unable to locate @muyajs/core stylesheet in ${libDirectory}. Found: ${cssCandidates.join(', ') || 'none'}`)
}

const muyaStylePath = resolveMuyaStyle()
const internalMainPackages = [
  '@markhere/document-model',
  '@markhere/export-core',
  '@markhere/export-html',
  '@markhere/export-pdf',
  '@markhere/export-docx',
  '@markhere/ipc-contract',
  '@markhere/markdown-engine',
  '@markhere/logging-core',
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
        input: {
          index: resolve(desktopRoot, 'src/main/index.ts'),
          'export-worker': resolve(desktopRoot, 'src/workers/export-worker.ts')
        }
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
    resolve: {
      alias: [
        { find: '@muyajs/core/style.css', replacement: muyaStylePath },
        { find: '@muyajs/core/lib/style.css', replacement: muyaStylePath }
      ]
    },
    root: resolve(desktopRoot, 'src/renderer'),
    plugins: [vue()],
    build: {
      outDir: resolve(desktopRoot, 'out/renderer'),
      emptyOutDir: true
    }
  }
})
