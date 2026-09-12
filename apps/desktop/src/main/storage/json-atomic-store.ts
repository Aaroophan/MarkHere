import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { atomicReplaceFile } from '../documents/atomic-write'

export async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await atomicReplaceFile(path, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'))
}
