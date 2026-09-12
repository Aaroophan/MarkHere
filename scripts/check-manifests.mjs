import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repo = fileURLToPath(new URL('..', import.meta.url))
const roots = ['apps', 'packages']
const manifests = []
const violations = []

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
      } else if (typeof range !== 'string' || /[~^*xX]|\b(?:latest|next)\b/.test(range)) {
        violations.push(`${manifest.name} ${group}.${name}: external dependency must be exact, got '${range}'`)
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
    if (typeof range !== 'string' || /[~^*xX]|\b(?:latest|next)\b/.test(range)) {
      violations.push(`root ${group}.${name}: external dependency must be exact, got '${range}'`)
    }
  }
}

if (violations.length) {
  console.error(`Manifest violations:\n${violations.map((violation) => `- ${violation}`).join('\n')}`)
  process.exit(1)
}
console.log(`Workspace manifests OK (${manifests.length} packages, exact external pins)`)
