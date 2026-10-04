import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const profile=JSON.parse(await readFile(resolve(root,'tests/compatibility/markdown-compatibility.json'),'utf8'))
const outDir=resolve(process.argv[2] ?? resolve(root,'test-results'))
await mkdir(outDir,{recursive:true})
const lines=['# MarkHere Markdown Compatibility Report','',`CommonMark: ${profile.commonMark.version} — ${profile.commonMark.status}`,'', '| Feature | Status | Notes |','| --- | --- | --- |']
for(const f of profile.features) lines.push(`| ${f.id} | ${f.status} | ${f.editor ?? f.security ?? ''} |`)
await writeFile(resolve(outDir,'markdown-compatibility-report.md'),`${lines.join('\n')}\n`)
await writeFile(resolve(outDir,'markdown-compatibility-report.json'),`${JSON.stringify(profile,null,2)}\n`)
console.log(`Wrote compatibility report to ${outDir}`)
