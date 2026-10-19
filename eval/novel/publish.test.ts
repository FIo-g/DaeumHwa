import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { publishFile } from './publish'

let root: string
const roots: string[] = []

const SRC = 'eval/results/novel/2026-10-18/summary.md'
const DEST = 'docs/eval/novel/2026-10-18/summary.md'

function write(rel: string, text: string): void {
  const abs = path.join(root, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, text)
}

function read(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8')
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'novel-publish-'))
  roots.push(root)
  write(SRC, 'new text\n')
})

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('publishFile', () => {
  it('copies the source and creates the date folder', () => {
    const result = publishFile({ src: SRC, dest: DEST, root })

    expect(result.status).toBe('copied')
    expect(result.attempts).toBe(1)
    expect(result.error).toBeNull()
    expect(result.dest).toBe(path.join(root, DEST))
    expect(read(DEST)).toBe('new text\n')
  })

  it('replaces an existing destination', () => {
    write(DEST, 'old text\n')

    const result = publishFile({ src: SRC, dest: DEST, root })

    expect(result.status).toBe('copied')
    expect(read(DEST)).toBe('new text\n')
  })

  it('keeps an existing destination when ifMissing is set', () => {
    write(DEST, 'old text\n')

    const result = publishFile({ src: SRC, dest: DEST, root, ifMissing: true })

    expect(result).toEqual({
      status: 'skipped',
      dest: path.join(root, DEST),
      error: null,
      attempts: 0,
    })
    expect(read(DEST)).toBe('old text\n')
  })

  it('copies when the destination is missing and ifMissing is set', () => {
    const result = publishFile({ src: SRC, dest: DEST, root, ifMissing: true })

    expect(result.status).toBe('copied')
    expect(read(DEST)).toBe('new text\n')
  })

  it('retries a failing copy', () => {
    let calls = 0
    const copy = (from: string, to: string) => {
      calls++
      if (calls < 3) throw new Error('busy')
      writeFileSync(to, readFileSync(from))
    }

    const result = publishFile({ src: SRC, dest: DEST, root, copy })

    expect(result.status).toBe('copied')
    expect(result.attempts).toBe(3)
    expect(read(DEST)).toBe('new text\n')
  })

  it('reports failure after all attempts without throwing', () => {
    const copy = () => {
      throw new Error('disk full')
    }

    const result = publishFile({ src: SRC, dest: DEST, root, copy })

    expect(result).toEqual({
      status: 'failed',
      dest: path.join(root, DEST),
      error: 'disk full',
      attempts: 3,
    })
  })

  it('honors the attempts option', () => {
    const copy = () => {
      throw new Error('disk full')
    }

    const result = publishFile({ src: SRC, dest: DEST, root, copy, attempts: 1 })

    expect(result.status).toBe('failed')
    expect(result.attempts).toBe(1)
  })

  it('fails without copying when the source is missing', () => {
    const result = publishFile({ src: 'eval/results/novel/2026-10-18/none.md', dest: DEST, root })

    expect(result.status).toBe('failed')
    expect(result.error).toContain('source not found')
    expect(result.attempts).toBe(0)
    expect(existsSync(path.join(root, DEST))).toBe(false)
  })

  it('rejects paths outside the allowed folders', () => {
    expect(() => publishFile({ src: SRC, dest: 'docs/other.md', root })).toThrow(/publish:/)
    expect(() => publishFile({ src: 'package.json', dest: DEST, root })).toThrow(/publish:/)
  })

  it('rejects a destination that escapes with ..', () => {
    expect(() => publishFile({ src: SRC, dest: 'docs/eval/novel/../../x.md', root })).toThrow(
      /publish:/,
    )
  })

  it('allows a name that starts with two dots', () => {
    const src = 'eval/results/novel/2026-10-18/..notes.md'
    const dest = 'docs/eval/novel/2026-10-18/..notes.md'
    write(src, 'notes\n')

    const result = publishFile({ src, dest, root })

    expect(result.status).toBe('copied')
    expect(read(dest)).toBe('notes\n')
  })
})
