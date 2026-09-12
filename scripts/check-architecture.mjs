import { builtinModules } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, relative, sep } from 'node:path'

const repo = fileURLToPath(new URL('..', import.meta.url))
const nodeBuiltins = new Set(
  builtinModules.flatMap((name) => [name, `node:${name}`])
)
const importRe = /(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g
const violations = []

function isNodeBuiltin(specifier) {
  const withoutNodePrefix = specifier.startsWith('node:') ? specifier.slice(5) : specifier
  const root = withoutNodePrefix.split('/')[0]
  return nodeBuiltins.has(specifier) || nodeBuiltins.has(root) || nodeBuiltins.has(`node:${root}`)
}

async function files(dir) {
  const out = []
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'out' || ent.name === 'dist') continue
    const full = join(dir, ent.name)
    if (ent.isDirectory()) out.push(...(await files(full)))
    else if (/\.(?:ts|tsx|mts|cts|js|mjs|cjs|vue)$/.test(ent.name)) out.push(full)
  }
  return out
}

for (const file of await files(repo)) {
  const rel = relative(repo, file).split(sep).join('/')
  const text = await readFile(file, 'utf8')
  const imports = [...text.matchAll(importRe)].map((match) => match[1])
  const inRenderer = rel.startsWith('apps/desktop/src/renderer/')
  const inPreload = rel.startsWith('apps/desktop/src/preload/')
  const inPackages = rel.startsWith('packages/')

  for (const specifier of imports) {
    if (inRenderer && (specifier === 'electron' || isNodeBuiltin(specifier))) {
      violations.push(`${rel}: renderer imports privileged '${specifier}'`)
    }
    if (inPackages && (specifier === 'electron' || isNodeBuiltin(specifier))) {
      violations.push(`${rel}: process-neutral package imports '${specifier}'`)
    }
    if (rel.startsWith('packages/export-') && (specifier === 'vue' || specifier.startsWith('@vue/'))) {
      violations.push(`${rel}: exporter imports Vue '${specifier}'`)
    }
    if (
      inPreload &&
      specifier !== 'electron' &&
      !specifier.startsWith('@markhere/') &&
      !specifier.startsWith('.')
    ) {
      violations.push(`${rel}: preload imports unreviewed '${specifier}'`)
    }
  }

  if ((inRenderer || inPreload) && /ipcRenderer\s*\.(?:send|invoke|sendSync)/.test(text)) {
    violations.push(`${rel}: raw ipcRenderer call is forbidden in renderer-facing layers`)
  }

  if (inRenderer && /\b(?:process|Buffer|require|__dirname|__filename)\b/.test(text)) {
    violations.push(`${rel}: renderer references a Node-style global`)
  }
}

const workspacePackageDirs = []
for (const parent of ['apps', 'packages']) {
  for (const ent of await readdir(join(repo, parent), { withFileTypes: true })) {
    if (ent.isDirectory()) workspacePackageDirs.push(join(repo, parent, ent.name))
  }
}

const graph = new Map()
for (const dir of workspacePackageDirs) {
  let manifest
  try {
    manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  } catch {
    continue
  }
  const deps = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
    ...(manifest.optionalDependencies ?? {})
  }
  const local = Object.entries(deps).filter(([name]) => name.startsWith('@markhere/'))
  for (const [name, range] of local) {
    if (range !== 'workspace:*') {
      violations.push(`${manifest.name}: local dependency ${name} must use workspace:*`)
    }
  }
  graph.set(manifest.name, local.map(([name]) => name))
}

const visiting = new Set()
const visited = new Set()
function visit(name, stack = []) {
  if (visiting.has(name)) {
    violations.push(`workspace dependency cycle: ${[...stack, name].join(' -> ')}`)
    return
  }
  if (visited.has(name)) return
  visiting.add(name)
  for (const dep of graph.get(name) ?? []) if (graph.has(dep)) visit(dep, [...stack, name])
  visiting.delete(name)
  visited.add(name)
}
for (const name of graph.keys()) visit(name)

if (violations.length) {
  console.error(`Architecture violations:\n${violations.map((violation) => `- ${violation}`).join('\n')}`)
  process.exit(1)
}

console.log(`Architecture boundaries OK (${graph.size} workspace packages checked)`)
