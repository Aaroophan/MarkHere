import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
const dir = resolve(process.argv[2] ?? 'dist')
const files = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile() && !['checksums.txt','release-manifest.json'].includes(entry.name)).map((entry) => entry.name).sort()
const lines = []
for (const name of files) lines.push(`${createHash('sha256').update(await readFile(join(dir,name))).digest('hex')}  ${name}`)
await writeFile(join(dir,'checksums.txt'), `${lines.join('\n')}\n`)
console.log(`Wrote ${lines.length} checksums`)
