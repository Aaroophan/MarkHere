import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const mode = process.argv[2] ?? 'all'
if (!new Set(['licenses', 'sbom', 'all']).has(mode)) {
  console.error(`Unsupported compliance mode '${mode}'. Use licenses, sbom, or all.`)
  process.exit(2)
}

const repo = fileURLToPath(new URL('..', import.meta.url))
const out = join(repo, 'artifacts', 'compliance')
await mkdir(out, { recursive: true })

const lockfilePath = join(repo, 'pnpm-lock.yaml')
let lockfile
try {
  lockfile = await readFile(lockfilePath)
} catch {
  console.error('Compliance generation requires the committed pnpm-lock.yaml.')
  process.exit(2)
}
const lockfileSha256 = createHash('sha256').update(lockfile).digest('hex')

const provenancePath = join(repo, 'docs', 'provenance', 'provenance.json')
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'))
if (provenance.schemaVersion !== 1 || !Array.isArray(provenance.entries)) {
  console.error('Invalid provenance manifest.')
  process.exit(2)
}

function runPnpmList() {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const result = spawnSync(
    executable,
    ['list', '--prod', '--recursive', '--depth', 'Infinity', '--json'],
    {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, CI: process.env.CI ?? '1' },
      maxBuffer: 64 * 1024 * 1024
    }
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr || `pnpm list exited with status ${result.status}`)
  }
  return JSON.parse(result.stdout)
}

let projects
try {
  projects = runPnpmList()
} catch (error) {
  console.error(`Unable to enumerate the installed production dependency graph: ${error.message}`)
  console.error('Run pnpm install --frozen-lockfile before pnpm compliance.')
  process.exit(2)
}

const packages = new Map()

async function readDeclaredLicense(node) {
  if (!node?.path) return 'UNKNOWN'
  try {
    const packageJson = JSON.parse(await readFile(join(node.path, 'package.json'), 'utf8'))
    if (typeof packageJson.license === 'string') return packageJson.license
    if (Array.isArray(packageJson.licenses)) {
      return packageJson.licenses
        .map((entry) => (typeof entry === 'string' ? entry : entry?.type))
        .filter(Boolean)
        .join(' OR ') || 'UNKNOWN'
    }
  } catch {
    // pnpm list still supplies enough identity to report the component as UNKNOWN.
  }
  return 'UNKNOWN'
}

async function visitDependency(name, node) {
  if (!node || typeof node !== 'object') return

  if (name.startsWith('@markhere/')) {
    for (const [childName, child] of Object.entries(node.dependencies ?? {})) {
      await visitDependency(childName, child)
    }
    return
  }

  const version = String(node.version ?? 'UNKNOWN')
  const key = `${name}@${version}`
  if (!packages.has(key)) {
    packages.set(key, {
      name,
      version,
      license: await readDeclaredLicense(node)
    })
  }

  for (const [childName, child] of Object.entries(node.dependencies ?? {})) {
    await visitDependency(childName, child)
  }
}

for (const project of projects) {
  for (const [name, node] of Object.entries(project.dependencies ?? {})) {
    await visitDependency(name, node)
  }
}

const components = [...packages.values()].sort(
  (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
)

const allowedTokens = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'MPL-2.0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'Unlicense'
])

function licenseTokens(expression) {
  return String(expression)
    .replace(/[()]/g, ' ')
    .split(/\s+(?:AND|OR|WITH)\s+|\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

const reviewRequired = components.filter((pkg) => {
  const tokens = licenseTokens(pkg.license)
  return pkg.license === 'UNKNOWN' || !tokens.length || tokens.some((token) => !allowedTokens.has(token))
})

function npmPurlName(name) {
  if (!name.startsWith('@')) return encodeURIComponent(name)
  const [scope, packageName] = name.split('/')
  return `${encodeURIComponent(scope)}/${encodeURIComponent(packageName ?? '')}`
}

function provenanceSummary() {
  return provenance.entries
    .map((entry) => ({
      upstreamProject: entry.upstreamProject,
      upstreamRepository: entry.upstreamRepository,
      upstreamRevision: entry.upstreamRevision,
      upstreamPath: entry.upstreamPath,
      destinationPath: entry.destinationPath,
      disposition: entry.disposition,
      license: entry.license,
      copyright: entry.copyright
    }))
    .sort((a, b) => a.destinationPath.localeCompare(b.destinationPath))
}

function makeNotices() {
  const lines = [
    '# MarkHere Third-Party Notices',
    '',
    'This file is generated from the installed **production dependency graph**, the committed pnpm lockfile, and the source-provenance manifest.',
    '',
    `Lockfile SHA-256: \`${lockfileSha256}\``,
    '',
    '## Package-manager production dependencies',
    ''
  ]

  if (components.length) {
    lines.push('| Package | Version | Declared license |', '|---|---:|---|')
    for (const pkg of components) {
      lines.push(`| \`${pkg.name}\` | \`${pkg.version}\` | ${pkg.license} |`)
    }
  } else {
    lines.push('No third-party production packages are present in the installed dependency graph.')
  }

  lines.push('', '## Copied or adapted upstream source', '')
  const sourceEntries = provenanceSummary()
  if (!sourceEntries.length) {
    lines.push('No MarkText/Muya source files are copied or adapted in the current foundation.')
  } else {
    lines.push('| Upstream | Revision | Upstream path | MarkHere path | Disposition | License |', '|---|---|---|---|---|---|')
    for (const entry of sourceEntries) {
      lines.push(
        `| ${entry.upstreamProject} | \`${entry.upstreamRevision}\` | \`${entry.upstreamPath}\` | \`${entry.destinationPath}\` | ${entry.disposition} | ${entry.license} |`
      )
    }
    lines.push(
      '',
      'The retained MarkText/Muya MIT license text is available at `docs/provenance/licenses/MARKTEXT-MIT.txt` and must be included in distributable notices whenever substantial MarkText/Muya source is present.'
    )
  }

  lines.push(
    '',
    '## Review policy',
    '',
    'A package with an unknown or non-allowlisted declared license makes `pnpm licenses` / `pnpm compliance` fail until the dependency is explicitly reviewed and the policy is updated.',
    ''
  )
  return `${lines.join('\n')}\n`
}

if (mode === 'licenses' || mode === 'all') {
  const licenseInventory = {
    schemaVersion: 1,
    lockfileSha256,
    productionPackages: components,
    sourceProvenance: provenanceSummary(),
    reviewRequired
  }
  await writeFile(join(out, 'licenses.json'), `${JSON.stringify(licenseInventory, null, 2)}\n`)
  const notices = makeNotices()
  await writeFile(join(repo, 'THIRD_PARTY_NOTICES.md'), notices)
  await writeFile(join(out, 'THIRD_PARTY_NOTICES.md'), notices)
}

if (mode === 'sbom' || mode === 'all') {
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${uuidFromHash(lockfileSha256)}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: 'application',
        name: 'MarkHere',
        version: '0.1.0-alpha.0'
      },
      properties: [
        { name: 'markhere:pnpm-lock-sha256', value: lockfileSha256 },
        { name: 'markhere:source-provenance-count', value: String(provenance.entries.length) }
      ]
    },
    components: components.map((pkg) => ({
      type: 'library',
      name: pkg.name,
      version: pkg.version,
      licenses: [licenseChoice(pkg.license)],
      purl: `pkg:npm/${npmPurlName(pkg.name)}@${pkg.version}`
    }))
  }
  const json = `${JSON.stringify(sbom, null, 2)}\n`
  await writeFile(join(out, 'sbom.json'), json)
  await writeFile(join(out, 'sbom.cdx.json'), json)
}

if (reviewRequired.length) {
  console.error(
    `License review required for ${reviewRequired.length} production package(s). See artifacts/compliance/licenses.json.`
  )
  process.exit(1)
}

console.log(
  `Compliance metadata generated for ${components.length} production package version(s); lockfile ${lockfileSha256.slice(0, 12)}...`
)

function licenseChoice(expression) {
  if (expression === 'UNKNOWN') return { license: { name: 'UNKNOWN' } }
  return /\s(?:AND|OR|WITH)\s|[()]/.test(expression)
    ? { expression }
    : { license: { id: expression } }
}

function uuidFromHash(hash) {
  const value = hash.slice(0, 32).split('')
  value[12] = '5'
  const variant = Number.parseInt(value[16], 16)
  value[16] = ((variant & 0x3) | 0x8).toString(16)
  const hex = value.join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
