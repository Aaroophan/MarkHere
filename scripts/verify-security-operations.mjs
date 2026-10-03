import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const errors = []
const read = (path) => readFile(join(root, path), 'utf8')
const requireAll = (text, fragments, label) => { for (const fragment of fragments) if (!text.includes(fragment)) errors.push(`${label}: missing ${fragment}`) }

const [securityCore, protocol, sanitizer, ipc, logger, crash, diagnostics, index, bridge, schemas, policy] = await Promise.all([
  read('packages/security-core/src/index.ts'),
  read('apps/desktop/src/main/protocols/app-protocol.ts'),
  read('packages/preview-renderer/src/sanitizer.ts'),
  read('apps/desktop/src/main/ipc/validated-ipc.ts'),
  read('apps/desktop/src/main/logging/local-logger.ts'),
  read('apps/desktop/src/main/diagnostics/crash-health-service.ts'),
  read('apps/desktop/src/main/diagnostics/diagnostic-service.ts'),
  read('apps/desktop/src/main/index.ts'),
  read('packages/ipc-contract/src/bridge.ts'),
  read('packages/ipc-contract/src/schemas.ts'),
  read('docs/security/production-hardening-policy.json')
])
requireAll(securityCore, ['class SecurityPolicy', 'mayOpenExternalUrl', 'mayLoadRemoteImage', 'mayResolveLocalResource', 'mayNavigate', 'mayCreateWindow', 'SECURITY_BUDGETS'], 'security policy')
requireAll(protocol, ["'file://*/*'", "'http://*/*'", "'https://*/*'", 'resourceType', 'mayLoadRemoteImage', "script-src 'self'", "connect-src 'self'"], 'network/CSP enforcement')
requireAll(sanitizer, ['DOMPurify.sanitize', 'FORBID_TAGS', 'foreignObject', 'SANITIZE_DOM', 'SANITIZE_NAMED_PROPS', 'EXTERNAL_CSS_URL'], 'DOM sanitizer')
requireAll(ipc, ['IpcAbuseProtector', 'exceedsGenericIpcBudget', 'IPC_RATE_LIMITED', 'IPC_REQUEST_TOO_LARGE', 'ipc.request.rejected'], 'IPC abuse protection')
requireAll(logger, ['MAX_LOG_FILE_BYTES', 'MAX_LOG_FILES', 'sanitizeMetadata', 'JSON.stringify(record)', 'readRedactedLogs'], 'local logging')
requireAll(crash, ['consecutiveStartupFailures', 'SAFE_MODE_THRESHOLD', '--safe-mode', 'markCleanShutdown'], 'safe mode')
requireAll(diagnostics, ['createBundle', 'readRedactedLogs', 'Excludes documents, recovery snapshots, clipboard', 'openLogsFolder', 'clearLogs'], 'diagnostics')
requireAll(index, ['crashReporter.start', 'uploadToServer: false', "process.on('uncaughtException'", "process.on('unhandledRejection'", 'renderer.process.gone', 'safeMode ?'], 'crash/privacy integration')
requireAll(bridge, ['DiagnosticsApi', 'createBundle()', 'openLogsFolder()', 'clearLogs()'], 'diagnostic preload contract')
requireAll(schemas, ['max(32 * 1024 * 1024)', 'max(8 * 1024 * 1024)', 'max(8192)', 'max(4096)'], 'request budgets')
requireAll(policy, ['EnableNodeOptionsEnvironmentVariable', 'EnableEmbeddedAsarIntegrityValidation', 'automaticCrashUpload', 'diagnosticBundleRequiresUserAction'], 'production hardening policy')

const corpus = JSON.parse(await read('packages/test-fixtures/fixtures/security/corpus-manifest.json'))
if (corpus.reviewRequiredToModify !== true || !Array.isArray(corpus.fixtures) || corpus.fixtures.length < 4) errors.push('security corpus manifest is incomplete')
else {
  for (const fixture of corpus.fixtures) {
    const body = await read(`packages/test-fixtures/fixtures/security/${fixture.path}`)
    const digest = createHash('sha256').update(body).digest('hex')
    if (digest !== fixture.sha256) errors.push(`security corpus hash mismatch: ${fixture.path}`)
  }
}

if (/console\.(?:log|debug|info)\(/u.test(index)) errors.push('main bootstrap uses direct console logging')
if (errors.length) { console.error(`Issue-8 security/operations violations:\n${errors.map((e) => `- ${e}`).join('\n')}`); process.exit(1) }
console.log('Issue-8 security enforcement, redacted logging, crash/safe-mode, privacy, and operational hardening structure OK')
