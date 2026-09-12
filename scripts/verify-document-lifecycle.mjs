import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repo = fileURLToPath(new URL('..', import.meta.url))
const required = [
  'packages/document-model/src/index.ts',
  'packages/document-model/src/index.test.ts',
  'apps/desktop/src/main/documents/file-capability-registry.ts',
  'apps/desktop/src/main/documents/file-service.ts',
  'apps/desktop/src/main/documents/text-codec.ts',
  'apps/desktop/src/main/documents/fingerprint.ts',
  'apps/desktop/src/main/documents/atomic-write.ts',
  'apps/desktop/src/main/documents/save-queue.ts',
  'apps/desktop/src/main/documents/watch-service.ts',
  'apps/desktop/src/main/storage/recovery-service.ts',
  'apps/desktop/src/main/storage/session-persistence-service.ts',
  'apps/desktop/src/main/storage/recent-document-store.ts',
  'apps/desktop/src/renderer/src/document-session-store.ts',
  'apps/desktop/test/main/atomic-write.test.ts',
  'apps/desktop/test/main/text-codec.test.ts',
  'apps/desktop/test/main/save-queue.test.ts'
]
for (const path of required) await access(join(repo, path))
const text = async (path) => readFile(join(repo, path), 'utf8')
const model = await text('packages/document-model/src/index.ts')
for (const fragment of [
  'dirty: revision !== persistedRevision',
  'class StaleDocumentRevisionError',
  'commitDocumentMutation',
  'applyPersistedRevision',
  'applyReload',
  'enterDocumentConflict'
]) if (!model.includes(fragment)) throw new Error(`Canonical document model invariant missing: ${fragment}`)
if (/markdown:\s*request\.markdown/.test(model) && /summary:\s*request\.markdown/.test(model)) throw new Error('Mutation metadata must never contain Markdown bodies')

const fileService = await text('apps/desktop/src/main/documents/file-service.ts')
for (const fragment of ['fingerprintMatchesExpected', 'DOC_SAVE_PRECONDITION_REQUIRED', 'atomicReplaceFile', 'PerDocumentSaveQueue', 'consume(request.targetSelectionToken', 'replacePath(request.documentId']) {
  if (!fileService.includes(fragment)) throw new Error(`File lifecycle guard missing: ${fragment}`)
}
const atomic = await text('apps/desktop/src/main/documents/atomic-write.ts')
for (const fragment of ["flush: true", '.markhere.tmp', 'rename(tempPath, targetPath)']) {
  if (!atomic.includes(fragment)) throw new Error(`Atomic persistence primitive missing: ${fragment}`)
}
const watcher = await text('apps/desktop/src/main/documents/watch-service.ts')
for (const fragment of ['awaitWriteFinish', 'fastFingerprintEqual', 'ExpectedWriteRecord', 'platformFileId', "kind: 'renamed'", 'selfWrite']) {
  if (!watcher.includes(fragment)) throw new Error(`Watcher/self-write guard missing: ${fragment}`)
}
if (/Date\.now\(\).*selfWrite/.test(watcher)) throw new Error('Self-write suppression must not be timing-only')

const recovery = await text('apps/desktop/src/main/storage/recovery-service.ts')
for (const fragment of ['schemaVersion: 1', 'writeJsonAtomic', 'persistedRevision', 'baseDiskFingerprint', 'discardForDocument']) {
  if (!recovery.includes(fragment)) throw new Error(`Recovery invariant missing: ${fragment}`)
}
const session = await text('apps/desktop/src/main/storage/session-persistence-service.ts')
for (const fragment of ['schemaVersion: 1', '#preserveInvalid', '.invalid-', 'writeJsonAtomic']) {
  if (!session.includes(fragment)) throw new Error(`Session migration/safe-fallback guard missing: ${fragment}`)
}
const ipc = await text('apps/desktop/src/main/ipc/register-ipc.ts')
for (const fragment of ['services.files.openSelected', 'services.files.saveDocument(', 'services.files.saveDocumentAs(', 'services.recovery.updateSnapshot']) {
  if (!ipc.includes(fragment)) throw new Error(`Issue-3 service is not wired through typed IPC: ${fragment}`)
}
const pkg = JSON.parse(await text('apps/desktop/package.json'))
for (const [name, version] of Object.entries({ chokidar: '5.0.0', chardet: '2.2.0', 'iconv-lite': '0.7.3' })) {
  if (pkg.dependencies?.[name] !== version) throw new Error(`Expected ${name}@${version}`)
}
console.log('Issue-3 document lifecycle, persistence, watcher, recovery, and session structure OK')
