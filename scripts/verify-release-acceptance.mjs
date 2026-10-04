import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const gate=JSON.parse(await readFile(resolve(root,'tests/release/release-gate.json'),'utf8'))
const evidenceDir=process.env.MARKHERE_RELEASE_EVIDENCE_DIR
if(!evidenceDir){ console.log(`Release acceptance policy OK: ${gate.requiredAutomatedEvidence.length} automated classes, ${gate.requiredManualGates.length} manual gates, ${gate.blockers.length} explicit blockers`); process.exit(0) }
const dir=resolve(evidenceDir); const errors=[]
for(const file of ['release-evidence.json','release-manifest.json','checksums.txt','sbom.json','THIRD_PARTY_NOTICES.md']){try{await access(resolve(dir,file))}catch{errors.push(`missing ${file}`)}}
if(!errors.length){
 const evidence=JSON.parse(await readFile(resolve(dir,'release-evidence.json'),'utf8'))
 for(const key of gate.requiredAutomatedEvidence) if(evidence.automated?.[key] !== 'passed') errors.push(`automated evidence not passed: ${key}`)
 for(const key of gate.requiredManualGates) if(evidence.manual?.[key] !== 'passed') errors.push(`manual gate not passed: ${key}`)
 for(const blocker of gate.blockers) if(evidence.openBlockers?.includes(blocker)) errors.push(`release blocker open: ${blocker}`)
 if(evidence.candidateSha256 !== evidence.qualifiedCandidateSha256) errors.push('qualified candidate hash differs from publication candidate')
}
if(errors.length){console.error(errors.map(e=>`- ${e}`).join('\n'));process.exit(1)}
console.log('Release candidate evidence is complete and candidate hash is unchanged')
