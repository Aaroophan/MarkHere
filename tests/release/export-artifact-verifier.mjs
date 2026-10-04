import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import JSZip from 'jszip'

const [htmlPath,pdfPath,docxPath]=process.argv.slice(2)
if(!htmlPath||!pdfPath||!docxPath) throw new Error('Usage: node tests/release/export-artifact-verifier.mjs <html> <pdf> <docx>')
const html=await readFile(resolve(htmlPath),'utf8')
if(!/^<!doctype html>/iu.test(html)||!html.includes('charset="utf-8"')||/<script\b/iu.test(html)) throw new Error('HTML export structural/sanitization verification failed')
const pdfBytes=new Uint8Array(await readFile(resolve(pdfPath)))
const pdf=await getDocument({data:pdfBytes,disableWorker:true}).promise
if(pdf.numPages<1) throw new Error('PDF has no pages')
const first=await pdf.getPage(1); const text=await first.getTextContent(); if(!text.items.length) throw new Error('PDF first page has no extractable text')
const zip=await JSZip.loadAsync(await readFile(resolve(docxPath)))
for(const name of ['[Content_Types].xml','word/document.xml','word/styles.xml','word/_rels/document.xml.rels']) if(!zip.file(name)) throw new Error(`DOCX missing ${name}`)
const documentXml=await zip.file('word/document.xml').async('text')
if(!/<w:tbl\b/u.test(documentXml)||!/<w:p\b/u.test(documentXml)) throw new Error('DOCX lacks native paragraph/table structure')
console.log(JSON.stringify({html:true,pdfPages:pdf.numPages,docxEntries:Object.keys(zip.files).length},null,2))
