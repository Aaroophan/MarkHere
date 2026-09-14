import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repo = fileURLToPath(new URL('..', import.meta.url))
const violations = []
const required = [
  'packages/markdown-engine/src/profile.ts',
  'packages/markdown-engine/src/parser.ts',
  'packages/markdown-engine/src/slugger.ts',
  'packages/preview-renderer/src/preview-renderer.ts',
  'packages/preview-renderer/src/sanitizer.ts',
  'packages/preview-renderer/src/render-coordinator.ts',
  'apps/desktop/src/main/resources/resource-capability-broker.ts',
  'apps/desktop/src/main/resources/resource-service.ts',
  'apps/desktop/src/renderer/src/components/PreviewPane.vue',
  'packages/test-fixtures/fixtures/markdown-everything.md',
  'packages/test-fixtures/fixtures/malicious-preview.md'
]
for (const rel of required) {
  try { await access(join(repo, rel)) } catch { violations.push(`missing ${rel}`) }
}

async function text(rel) { return readFile(join(repo, rel), 'utf8') }
const profile = await text('packages/markdown-engine/src/profile.ts')
const markdownManifest = JSON.parse(await text('packages/markdown-engine/package.json'))
const previewManifest = JSON.parse(await text('packages/preview-renderer/package.json'))
const preview = await text('packages/preview-renderer/src/preview-renderer.ts')
const sanitizer = await text('packages/preview-renderer/src/sanitizer.ts')
const coordinator = await text('packages/preview-renderer/src/render-coordinator.ts')
const protocol = await text('apps/desktop/src/main/protocols/app-protocol.ts')
const broker = await text('apps/desktop/src/main/resources/resource-capability-broker.ts')
const resourceService = await text('apps/desktop/src/main/resources/resource-service.ts')
const fileService = await text('apps/desktop/src/main/documents/file-service.ts')
const ipc = await text('apps/desktop/src/main/ipc/register-ipc.ts')
const renderer = await text('apps/desktop/src/renderer/src/components/PreviewPane.vue')

if (!profile.includes("commonMark: '0.31.2'")) violations.push('CommonMark profile must be pinned to 0.31.2')
for (const flag of ['gfmTables: true', 'gfmTaskLists: true', 'gfmStrikethrough: true', 'extendedAutolinks: true', 'frontMatter: true', 'math: true', 'mermaid: true', "rawHtml: 'sanitized'"]) {
  if (!profile.includes(flag)) violations.push(`Markdown profile missing ${flag}`)
}
if (markdownManifest.dependencies?.['markdown-it'] !== '15.0.2') violations.push('markdown-it must be pinned to 15.0.2')
for (const [name, version] of Object.entries({ dompurify: '3.4.15', katex: '0.18.0', mermaid: '11.15.0', prismjs: '1.30.0' })) {
  if (previewManifest.dependencies?.[name] !== version) violations.push(`${name} must be pinned to ${version}`)
}
if (!preview.includes("securityLevel: 'strict'")) violations.push('Mermaid must run with strict securityLevel')
if (!preview.includes('trust: false')) violations.push('KaTeX must use trust:false')
if (!preview.includes("strict: 'error'")) violations.push('KaTeX must use strict:error')
if (!sanitizer.includes('DOMPurify.sanitize')) violations.push('Preview must sanitize generated/raw markup with DOMPurify')
if (!sanitizer.includes("'style'")) violations.push('Raw preview must explicitly control style/CSS authority')
const highlighter = await text('packages/preview-renderer/src/highlight.ts')
if (!highlighter.includes("prism-yaml")) violations.push('Prism YAML must be imported when yml is advertised as an alias')
if (!coordinator.includes('constructor(delayMs = 150)')) violations.push('Preview coordinator must retain the 150 ms architecture default')
if (!coordinator.includes("'superseded'")) violations.push('Preview coordinator must model superseded renders')
if (!protocol.includes('resources.resolveProtocolRequest(request.url)')) violations.push('markhere-resource:// must be capability backed')
if (!protocol.includes('webRequest.onBeforeRequest')) violations.push('resource protocol must enforce ownership through webRequest metadata')
if (!protocol.includes("details.resourceType === 'image'")) violations.push('resource protocol must be restricted to image subresources')
if (!protocol.includes('resources?.ownsProtocolRequest(details.url, ownerWebContentsId)')) violations.push('resource protocol must verify scope ownership for the requesting WebContents')
if (protocol.includes('Resource capabilities are not available before Issue 4')) violations.push('Issue-3 resource protocol placeholder remains')
if (!protocol.includes("'x-content-type-options': 'nosniff'")) violations.push('resource responses must disable MIME sniffing')
if (!broker.includes("relative(root, target)")) violations.push('resource broker must enforce filesystem containment')
if (!broker.includes("scopeId") || !broker.includes("ownerWebContentsId")) violations.push('resource scope must be owner bound')
if (!broker.includes('ownsProtocolRequest')) violations.push('resource broker must expose an owner-bound protocol request check')
if (!fileService.includes('this.#resources.bindDocument')) violations.push('opened documents must receive a real resource scope')
if (!fileService.includes('this.#resources.rebindDocument')) violations.push('Save As/rename must rebind resource scope')
if (!resourceService.includes('classifyExternalUrl')) violations.push('document links must use central URL policy')
if (!resourceService.includes("this.#selections.issue('document-open'")) violations.push('local document links must route through FileService selection capability')
if (!ipc.includes('services.resources.resolveLink')) violations.push('resource resolveLink IPC must be live')
if (!renderer.includes('PreviewRenderCoordinator(150)')) violations.push('renderer preview must use the cancellable coordinator')
if (!renderer.includes('window.markhere.resources.resolveLink')) violations.push('renderer links must use the semantic resource API')
if (/\bfile:\/\//.test(preview + renderer + broker)) violations.push('preview/resource broker must not expose file:// URLs')

if (violations.length) {
  console.error(`Markdown/preview violations:\n${violations.map((v) => `- ${v}`).join('\n')}`)
  process.exit(1)
}
console.log('Issue-4 Markdown dialect, safe preview, resource broker, and scheduling structure OK')
