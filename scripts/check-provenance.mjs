import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const repo = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = join(repo, 'docs', 'provenance', 'provenance.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
  throw new Error('Invalid provenance manifest')
}

const requiredFields = [
  'upstreamProject',
  'upstreamRepository',
  'upstreamRevision',
  'upstreamPath',
  'destinationPath',
  'disposition',
  'license',
  'copyright',
  'importedAt',
  'notes'
]
const declared = new Map()
const violations = []

for (const [index, entry] of manifest.entries.entries()) {
  for (const field of requiredFields) {
    if (!(field in entry) || entry[field] === '') {
      violations.push(`provenance entry ${index} is missing '${field}'`)
    }
  }
  if (!['copied', 'adapted'].includes(entry.disposition)) {
    violations.push(`provenance entry ${index} has unsupported disposition '${entry.disposition}'`)
  }
  if (declared.has(entry.destinationPath)) {
    violations.push(`duplicate provenance destination '${entry.destinationPath}'`)
  }
  declared.set(entry.destinationPath, entry)
}

const sourceRoots = [join(repo, 'apps'), join(repo, 'packages')]
const markers = []

async function walk(dir) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name)
    if (ent.isDirectory()) await walk(full)
    else if (/\.(?:ts|tsx|js|mjs|vue)$/.test(ent.name)) {
      const text = await readFile(full, 'utf8')
      if (text.includes('@markhere-upstream')) {
        markers.push(relative(repo, full).replaceAll('\\', '/'))
      }
    }
  }
}
for (const sourceRoot of sourceRoots) await walk(sourceRoot)

for (const file of markers) {
  if (!declared.has(file)) violations.push(`upstream-marked file missing provenance entry: ${file}`)
}
for (const destination of declared.keys()) {
  if (!markers.includes(destination)) {
    violations.push(`provenance entry has no @markhere-upstream source marker: ${destination}`)
  }
}

if (violations.length) {
  console.error(`Provenance violations:\n${violations.map((violation) => `- ${violation}`).join('\n')}`)
  process.exit(1)
}

console.log(`Provenance OK (${manifest.entries.length} imported entries, ${markers.length} source markers)`)
