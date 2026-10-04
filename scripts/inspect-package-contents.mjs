import { readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
const root=resolve(process.argv[2] ?? 'dist/win-unpacked')
const errors=[]
const forbidden=[/^\.env(?:\.|$)/iu,/\.pfx$/iu,/\.p12$/iu,/\.pem$/iu,/\.key$/iu,/^pnpm-lock\.yaml$/iu,/^(?:test|tests)$/iu,/playwright/iu,/\.map$/iu]
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(forbidden.some((r)=>r.test(entry.name)))errors.push(path);if(entry.isDirectory())await walk(path)}}
await walk(root)
if(errors.length){console.error(`Forbidden development/secret-like packaged content:\n${errors.map((p)=>`- ${p}`).join('\n')}`);process.exit(1)}
console.log(`Packaged content inspection OK: ${basename(root)}`)
