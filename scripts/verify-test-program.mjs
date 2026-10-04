import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const errors=[]
const required=[
 'playwright.config.ts','playwright.performance.config.ts','tests/e2e/electron-smoke.spec.ts','tests/e2e/accessibility.spec.ts','tests/e2e/compatibility.spec.ts',
 'tests/performance/budgets.json','tests/performance/electron-performance.spec.ts','tests/performance/soak.spec.ts','tests/windows/system-acceptance.ps1',
 'tests/windows/manual-accessibility.md','tests/windows/manual-interoperability.md','tests/traceability.json','tests/release/release-gate.json','tests/release/release-evidence.template.json','tests/compatibility/markdown-compatibility.json',
 'packages/markdown-engine/src/conformance.test.ts','packages/document-model/src/state-machine.property.test.ts','scripts/generate-performance-fixtures.mjs','.github/workflows/test-pr.yml','.github/workflows/test-nightly.yml','.github/workflows/release-candidate.yml'
]
for(const f of required){try{await access(resolve(root,f))}catch{errors.push(`missing ${f}`)}}
const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'))
for(const dep of ['@playwright/test','@axe-core/playwright','fast-check','pdfjs-dist','jszip']) if(!pkg.devDependencies?.[dep]) errors.push(`missing test dependency ${dep}`)
for(const script of ['test:conformance','test:e2e','test:a11y','test:performance','test:soak','check:traceability','check:release-acceptance']) if(!pkg.scripts?.[script]) errors.push(`missing script ${script}`)
const pw=await readFile(resolve(root,'playwright.config.ts'),'utf8'); if(!pw.includes('retries: 0')) errors.push('Playwright must not hide flakes with retries')
const perf=JSON.parse(await readFile(resolve(root,'tests/performance/budgets.json'),'utf8')); if(perf.coldStartUsableMs!==2500||perf.typingInputToPaintP95Ms!==50||perf.ordinarySplitPreviewMs!==250) errors.push('performance budgets drifted from requirements')
const release=JSON.parse(await readFile(resolve(root,'tests/release/release-gate.json'),'utf8')); if(!release.blockers.includes('data-loss')||!release.blockers.includes('security-regression')) errors.push('security/data-loss must remain release blockers')
const fixtureDirs=['commonmark','gfm','markhere-extensions','roundtrip','unicode','huge','windows-paths','export','regressions','unknown','encoding']
for(const name of fixtureDirs){try{await access(resolve(root,'packages/test-fixtures/fixtures',name))}catch{errors.push(`missing fixture family ${name}`)}}
if(errors.length){console.error(`Issue-10 test-program violations:\n${errors.map(e=>`- ${e}`).join('\n')}`);process.exit(1)}
console.log('Issue-10 test harness, conformance, E2E, performance, accessibility, compatibility, and release-gate structure OK')
