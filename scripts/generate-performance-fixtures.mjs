import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
const out=resolve(process.argv[2] ?? 'test-results/performance-fixtures')
await mkdir(out,{recursive:true})
const classes=[['P0',10*1024],['P1',100*1024],['P2',1024*1024],['P3',5*1024*1024],['P4',20*1024*1024]]
for(const [name,target] of classes){
  const header=`# MarkHere ${name} deterministic performance fixture\n\n`
  const line=`## ${name} section\nSynthetic multilingual line: සිංහල தமிழ் 中文 emoji 📝 **bold** [link](https://example.com).\n\n`
  const headerBytes=Buffer.byteLength(header)
  const lineBytes=Buffer.byteLength(line)
  const repeats=Math.ceil(Math.max(0,target-headerBytes)/lineBytes)+1
  const bytes=Buffer.from(header+line.repeat(repeats),'utf8').subarray(0,target)
  await writeFile(join(out,`${name}.md`),bytes)
}
await writeFile(join(out,'many-headings.md'),Array.from({length:2000},(_,i)=>`# Heading ${i+1}\n`).join(''),'utf8')
await writeFile(join(out,'many-list-items.md'),Array.from({length:10000},(_,i)=>`- item ${i+1}\n`).join(''),'utf8')
console.log(`Generated performance fixtures in ${out}`)
