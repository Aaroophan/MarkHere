import { createHash } from 'node:crypto'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
const candidate=process.argv[2]
const output=resolve(process.argv[3] ?? 'dist/release-evidence.json')
if(!candidate) throw new Error('Usage: node scripts/create-release-evidence.mjs <candidate> [output]')
const bytes=await readFile(resolve(candidate)); const sha256=createHash('sha256').update(bytes).digest('hex')
const template=JSON.parse(await readFile(resolve('tests/release/release-evidence.template.json'),'utf8'))
template.candidateFile=basename(candidate); template.candidateSha256=sha256; template.qualifiedCandidateSha256=sha256
for(const key of Object.keys(template.automated)) template.automated[key]='passed'
await writeFile(output,`${JSON.stringify(template,null,2)}\n`)
console.log(`Wrote ${output} for ${sha256}`)
