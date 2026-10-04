import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const matrix=JSON.parse(await readFile(resolve(root,'tests/traceability.json'),'utf8'))
const manual=JSON.parse(await readFile(resolve(root,'tests/release/manual-gates.json'),'utf8'))
const requirements=await readFile(resolve(root,'docs/02-requirements-and-scope.md'),'utf8')
const ids=[...requirements.matchAll(/\|\s*((?:FR|NFR)-[A-Z]+-\d+)\s*\|/gu)].map((m)=>m[1])
const p0=[...requirements.matchAll(/\|\s*((?:FR|NFR)-[A-Z]+-\d+)\s*\|[^\n]*\|\s*P0\s*\|/gu)].map((m)=>m[1])
const errors=[]
for(const id of ids){ if(!matrix.requirements[id]) errors.push(`missing traceability row: ${id}`) }
for(const id of p0){ const row=matrix.requirements[id]; if(!row){continue} if(!Array.isArray(row.tests)||row.tests.length===0) errors.push(`P0 ${id} has no automated evidence`); for(const path of row.tests??[]){ try{await access(resolve(root,path))}catch{errors.push(`${id}: missing evidence ${path}`)} } if(row.manualGate&&!manual.gates[row.manualGate]) errors.push(`${id}: unknown manual gate ${row.manualGate}`) }
for(const [id,gate] of Object.entries(manual.gates)){ if(!gate.releaseBlocking) errors.push(`${id}: manual release gate is not blocking`); try{await access(resolve(root,gate.evidence))}catch{errors.push(`${id}: missing manual evidence ${gate.evidence}`)} }
if(errors.length){console.error(errors.map((e)=>`- ${e}`).join('\n'));process.exit(1)}
console.log(`Requirement traceability OK: ${ids.length} requirements, ${p0.length} P0, zero unaccounted P0 requirements`)
