import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'

const SRC_DIR = join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(filePath)
    if (entry.name.includes('.test.')) return []
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) return []
    return [filePath]
  })
}

function firstStatementIsUseServer(source: string): boolean {
  const withoutLeadingComments = source.replace(/^(?:\s+|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, '')
  return /^(['"])use server\1\s*(?:;|\r?\n|$)/.test(withoutLeadingComments)
}

function isAllowedExport(line: string): boolean {
  return (
    line.startsWith('export async function') ||
    line.startsWith('export default async function') ||
    line.startsWith('export type ') ||
    line.startsWith('export interface ')
  )
}

it('exports only async functions and types from use server files', () => {
  const violations = sourceFiles(SRC_DIR).flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf8')
    if (!firstStatementIsUseServer(source)) return []

    const relativePath = relative(process.cwd(), filePath)
    return source
      .split(/\r?\n/)
      .filter((line) => line.startsWith('export ') && !isAllowedExport(line))
      .map((line) => `${relativePath}: ${line}`)
  })

  expect(violations).toEqual([])
})
