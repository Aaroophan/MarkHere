import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const repo = fileURLToPath(new URL('..', import.meta.url))
const required = [
  'packages/editor-session/src/index.ts', 'packages/editor-session/src/index.test.ts',
  'packages/source-editor/src/index.ts', 'packages/editor-core/src/index.ts',
  'packages/editor-core/src/muya-v020-compat.ts', 'packages/editor-core/src/muya-v020-compat.test.ts',
  'apps/desktop/src/renderer/src/components/DocumentEditor.vue',
  'apps/desktop/src/renderer/src/components/PreviewPane.vue',
  'apps/desktop/src/main/storage/settings-service.ts'
]
for (const file of required) await access(join(repo, file))
const read = (file) => readFile(join(repo, file), 'utf8')
const root = JSON.parse(await read('package.json'))
const sourceManifest = JSON.parse(await read('packages/source-editor/package.json'))
const editorManifest = JSON.parse(await read('packages/editor-core/package.json'))
const desktop = JSON.parse(await read('apps/desktop/package.json'))
const exact = {
  '@codemirror/commands': '6.11.0', '@codemirror/lang-markdown': '6.5.2', '@codemirror/language': '6.12.4',
  '@codemirror/search': '6.7.2', '@codemirror/state': '6.7.4', '@codemirror/view': '6.43.11', codemirror: '6.0.2'
}
for (const [name, version] of Object.entries(exact)) if (sourceManifest.dependencies?.[name] !== version) throw new Error(`${name} must be pinned to ${version}`)
if (editorManifest.dependencies?.['@muyajs/core'] !== '0.2.0') throw new Error('@muyajs/core must be pinned to the installable public 0.2.0 release')
for (const name of ['@markhere/editor-core','@markhere/editor-session','@markhere/source-editor']) if (desktop.dependencies?.[name] !== 'workspace:*') throw new Error(`desktop missing ${name}`)
const model = await read('packages/document-model/src/index.ts')
for (const text of ['StructuralAnchor','TextRange','setDocumentMode','updateSplitViewState']) if (!model.includes(text)) throw new Error(`document view model missing ${text}`)
const orchestrator = await read('packages/editor-session/src/index.ts')
for (const text of ['ALL_MODE_TRANSITIONS','flushActiveEditable','rolling-back','commitFlushedMarkdown','EditorCommandId','EDITOR_COMMAND_DEFINITIONS','applyMarkdownCommand']) if (!orchestrator.includes(text)) throw new Error(`ModeController/command layer missing ${text}`)
const source = await read('packages/source-editor/src/index.ts')
for (const text of ['setState(this.#createState(markdownText))','markdown()','openSearchPanel','captureStructuralAnchor','scrollToStructuralAnchor','documentTop','lineBlockAtHeight','applyMarkdownCommand']) if (!source.includes(text)) throw new Error(`Source adapter missing ${text}`)
if (/saveDocument|writeFile|ipcRenderer/.test(source)) throw new Error('Source adapter must never persist files or invoke IPC')
const wysiwyg = await read('packages/editor-core/src/index.ts')
for (const text of ["@muyajs/core/lib/style.css",'new Muya(','drainPendingMuyaFrame','getIndexCursor','setIndexCursor','WysiwygRoundTripUnsafeError','replaceCanonicalWithUndoBoundary','nativeUndoDepth','syntheticUndo','takeNativeRedo','restoreNativeRedo','parkedNativeRedo','applyMarkdownCommand','findNext()','replace(value: string']) if (!wysiwyg.includes(text)) throw new Error(`WYSIWYG adapter missing ${text}`)
for (const forbidden of ['this.#muya.flush()', 'this.#muya.getCursorOffset()', 'this.#muya.setCursorByOffset(', 'this.#muya.replaceContent(', 'this.#muya.getHistory()', 'this.#muya.setHistory(']) if (wysiwyg.includes(forbidden)) throw new Error(`WYSIWYG adapter relies on unpublished Muya API: ${forbidden}`)
const compat = await read('packages/editor-core/src/muya-v020-compat.ts')
for (const text of ['@markhere-upstream','injectStateSentinels','setContentPreservingHistory','drainPendingMuyaFrame','nativeUndoDepth','takeNativeRedo','restoreNativeRedo']) if (!compat.includes(text)) throw new Error(`Muya 0.2 compatibility layer missing ${text}`)
const component = await read('apps/desktop/src/renderer/src/components/DocumentEditor.vue')
for (const text of ["'preview'", "'wysiwyg'", "'source'", "'split'", 'flushActiveEditable', 'split-divider', 'syncFromSource', 'syncFromPreview', 'pendingSplitAnchor', 'suspendedWysiwyg', 'replaceCanonicalWithUndoBoundary', 'wysiwygSearchOpen', 'v-show="renderMode === \'wysiwyg\'"']) if (!component.includes(text)) throw new Error(`DocumentEditor missing ${text}`)
if (component.includes('history: unknown')) throw new Error('DocumentEditor must not serialize Muya private history across modes')
const app = await read('apps/desktop/src/renderer/src/App.vue')
if (!app.includes('await editor.value?.flushActiveEditable()')) throw new Error('Save path must flush active editor first')
for (const mode of ['view.mode.preview','view.mode.wysiwyg','view.mode.source','view.mode.split']) if (!app.includes(mode)) throw new Error(`renderer command missing ${mode}`)
const parser = await read('packages/markdown-engine/src/parser.ts')
for (const attr of ['data-mh-block-id','data-mh-source-start','data-mh-source-end']) if (!parser.includes(attr)) throw new Error(`structural preview mapping missing ${attr}`)
const preview = await read('packages/preview-renderer/src/preview-renderer.ts')
for (const text of ['captureStructuralAnchor','scrollToStructuralAnchor']) if (!preview.includes(text)) throw new Error(`preview structural sync missing ${text}`)
const settings = await read('apps/desktop/src/main/storage/settings-service.ts')
if (!settings.includes("defaultMode: 'preview'") || !settings.includes('splitRatio: 0.5') || !settings.includes('syncScroll: true')) throw new Error('Issue-5 defaults missing')
const protocol = await read('apps/desktop/src/main/protocols/app-protocol.ts')
if (!protocol.includes("'file://*/*'") || !protocol.includes("details.url.startsWith('file:')")) throw new Error('WYSIWYG renderer raw file:// loads must be denied')
if (root.scripts?.['check:editor-modes'] !== 'node scripts/verify-editor-modes.mjs') throw new Error('root check:editor-modes missing')
console.log('Issue-5 four-mode editor structure OK (12 transitions, canonical flush, installable Muya adapter, Source/WYSIWYG/Split/Preview)')
