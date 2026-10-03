import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const policy = JSON.parse(await readFile(join(root, 'docs/security/production-hardening-policy.json'), 'utf8'))
const desktop = JSON.parse(await readFile(join(root, 'apps/desktop/package.json'), 'utf8'))
const errors = []
if (policy.unresolvedCriticalFindingsAllowed !== false) errors.push('critical security findings must fail closed')
if (policy.privacy?.automaticTelemetry !== false || policy.privacy?.automaticCrashUpload !== false) errors.push('privacy policy must remain local-only by default')
for (const name of policy.prohibitedRuntimePackages ?? []) if (desktop.dependencies?.[name] || desktop.devDependencies?.[name]) errors.push(`prohibited dependency: ${name}`)
for (const [name, version] of Object.entries({ ...(desktop.dependencies ?? {}), ...(desktop.devDependencies ?? {}) })) {
  if (typeof version === 'string' && !version.startsWith('workspace:') && /[~^*xX]|latest/u.test(version)) errors.push(`dependency ${name} is not exactly pinned: ${version}`)
}
try { await access(join(root, 'pnpm-lock.yaml')) } catch { console.warn('Security release note: pnpm-lock.yaml is absent; dependency audit/release qualification remains blocked until Issue-1 lockfile requirement is satisfied.') }
const expectedFuseNames = ['RunAsNode','EnableNodeOptionsEnvironmentVariable','EnableNodeCliInspectArguments','OnlyLoadAppFromAsar','EnableEmbeddedAsarIntegrityValidation','GrantFileProtocolExtraPrivileges']
for (const name of expectedFuseNames) if (!(name in (policy.expectedFusesForIssue9 ?? {}))) errors.push(`missing expected fuse policy: ${name}`)
if (errors.length) { console.error(errors.map((e) => `- ${e}`).join('\n')); process.exit(1) }
console.log('Issue-8 dependency/privacy/fuse hardening policy OK')
