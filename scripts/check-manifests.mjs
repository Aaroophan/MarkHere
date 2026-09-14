import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repo = fileURLToPath(new URL('..', import.meta.url))
const roots = ['apps', 'packages']
const manifests = []
const violations = []

const IMMUTABLE_GIT_SUBDIR = /^github:[^/#]+\/[^#]+#[0-9a-f]{40}&path:[^\s]+$/i
const isExactExternalPin = (range) => {
  if (typeof range !== 'string') return false
  if (IMMUTABLE_GIT_SUBDIR.test(range)) return true
  if (/\b(?:latest|next)\b/i.test(range)) return false
  // Foundation dependencies are intentionally exact. Reject semver range
  // operators/wildcards without treating ordinary package/host letters (e.g.
  // the "x" in "marktext") as a wildcard.
  if (/^[~^><=*]/.test(range) && !/^\d/.test(range)) return false
  if (/[|*]/.test(range)) return false
  if (/^[v]?\d+(?:\.\d+){2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(range)) return true
  return false
}

for (const root of roots) {
  for (const ent of await readdir(join(repo, root), { withFileTypes: true })) {
    if (!ent.isDirectory()) continue
    const path = join(repo, root, ent.name, 'package.json')
    let manifest
    try {
      manifest = JSON.parse(await readFile(path, 'utf8'))
    } catch {
      continue
    }
    manifests.push({ root, dir: ent.name, path, manifest })
  }
}

const names = new Set()
for (const { root, dir, manifest } of manifests) {
  if (!manifest.name?.startsWith('@markhere/')) {
    violations.push(`${root}/${dir}: workspace package name must use @markhere/*`)
  }
  if (names.has(manifest.name)) violations.push(`duplicate workspace package name: ${manifest.name}`)
  names.add(manifest.name)
  if (manifest.private !== true) violations.push(`${manifest.name}: Issue-1 workspace packages must be private`)
  if (manifest.version !== '0.1.0-alpha.0') violations.push(`${manifest.name}: unexpected foundation version ${manifest.version}`)
  if (typeof manifest.scripts?.typecheck !== 'string') violations.push(`${manifest.name}: missing typecheck script`)
  if (typeof manifest.scripts?.test !== 'string') violations.push(`${manifest.name}: missing test script`)

  const dependencyGroups = [
    ['dependencies', manifest.dependencies ?? {}],
    ['devDependencies', manifest.devDependencies ?? {}],
    ['optionalDependencies', manifest.optionalDependencies ?? {}]
  ]
  for (const [group, dependencies] of dependencyGroups) {
    for (const [name, range] of Object.entries(dependencies)) {
      if (name.startsWith('@markhere/')) {
        if (range !== 'workspace:*') violations.push(`${manifest.name} ${group}.${name}: use workspace:*`)
        if (!names.has(name) && !manifests.some((item) => item.manifest.name === name)) {
          violations.push(`${manifest.name} ${group}.${name}: references missing workspace package`)
        }
      } else if (!isExactExternalPin(range)) {
        violations.push(`${manifest.name} ${group}.${name}: external dependency must be exact or an immutable Git-subdirectory pin, got '${range}'`)
      }
    }
  }
}

const rootManifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
for (const [group, dependencies] of [
  ['dependencies', rootManifest.dependencies ?? {}],
  ['devDependencies', rootManifest.devDependencies ?? {}]
]) {
  for (const [name, range] of Object.entries(dependencies)) {
    if (!isExactExternalPin(range)) {
      violations.push(`root ${group}.${name}: external dependency must be exact or an immutable Git-subdirectory pin, got '${range}'`)
    }
  }
}

if (violations.length) {
  console.error(`Manifest violations:\n${violations.map((violation) => `- ${violation}`).join('\n')}`)
  process.exit(1)
}
console.log(`Workspace manifests OK (${manifests.length} packages, exact external pins)`)
