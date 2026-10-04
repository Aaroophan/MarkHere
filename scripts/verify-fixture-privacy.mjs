import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','packages/test-fixtures/fixtures')
const findings=[]
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else if(/\.(md|txt|json|svg)$/iu.test(entry.name)){const text=await readFile(path,'utf8').catch(()=>null);if(text===null)continue;for(const pattern of [/C:\\Users\\[A-Za-z0-9._-]+\\/u,/\/Users\/[A-Za-z0-9._-]+\//u,/\/home\/[A-Za-z0-9._-]+\//u,/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/u,/ghp_[A-Za-z0-9]{20,}/u,/AKIA[0-9A-Z]{16}/u]) if(pattern.test(text)) findings.push(`${path}: ${pattern}`)}}}
await walk(root)
if(findings.length){console.error(findings.join('\n'));process.exit(1)}
console.log('Synthetic fixture privacy scan OK')
