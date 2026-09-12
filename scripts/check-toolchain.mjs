import { readFile } from 'node:fs/promises'
import { toolchain } from './toolchain-versions.mjs'

const actualNode = process.versions.node
if (actualNode !== toolchain.node) {
  console.error(`Node mismatch: expected ${toolchain.node}, got ${actualNode}`)
  process.exitCode = 1
}

const root = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
if (root.packageManager !== `pnpm@${toolchain.pnpm}`) {
  console.error(`packageManager must be pnpm@${toolchain.pnpm}`)
  process.exitCode = 1
}

if (!process.exitCode) console.log(`Toolchain manifest OK (Node ${toolchain.node}, pnpm ${toolchain.pnpm})`)
