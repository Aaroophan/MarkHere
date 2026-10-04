import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import budgets from './budgets.json'
import { launchMarkHere } from '../e2e/electron-harness'

function p95(values: number[]): number { const sorted=[...values].sort((a,b)=>a-b); return sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*0.95)-1)] ?? 0 }
const enforce = process.env.MARKHERE_REFERENCE_PC === '1'

test('PERF-START-001 NFR-PERF-001 cold start to usable shell', async ({}, testInfo) => {
  const start=performance.now()
  const app=await launchMarkHere([resolve('packages/test-fixtures/fixtures/foundation.md')])
  try {
    await expect(app.page.getByRole('button',{name:'Source'})).toBeVisible()
    const elapsed=performance.now()-start
    await testInfo.attach('cold-start.json',{body:Buffer.from(JSON.stringify({elapsedMs:elapsed,budgetMs:budgets.coldStartUsableMs,enforced:enforce},null,2)),contentType:'application/json'})
    if(enforce) expect(elapsed).toBeLessThanOrEqual(budgets.coldStartUsableMs)
  } finally { await app.close() }
})

test('PERF-TYPE-001 NFR-PERF-002 source typing interaction p95', async ({}, testInfo) => {
  const app=await launchMarkHere([resolve('packages/test-fixtures/fixtures/foundation.md')])
  try {
    await app.page.getByRole('button',{name:'Source'}).click()
    const editor=app.page.locator('.cm-content')
    await editor.click()
    const samples:number[]=[]
    for(let i=0;i<25;i++){ const start=performance.now(); await app.page.keyboard.type('x'); await app.page.evaluate(()=>new Promise(requestAnimationFrame)); samples.push(performance.now()-start) }
    const value=p95(samples)
    await testInfo.attach('typing-p95.json',{body:Buffer.from(JSON.stringify({p95Ms:value,budgetMs:budgets.typingInputToPaintP95Ms,enforced:enforce,samples},null,2)),contentType:'application/json'})
    if(enforce) expect(value).toBeLessThanOrEqual(budgets.typingInputToPaintP95Ms)
  } finally { await app.close() }
})
