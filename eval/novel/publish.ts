import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

// Copies one finished file from the run side (eval/results/novel) into the docs side
// (docs/eval/novel). Agents write only the run side; the workflow publishes with this command.

const SRC_BASE = path.join('eval', 'results', 'novel')
const DEST_BASE = path.join('docs', 'eval', 'novel')
const DEFAULT_ATTEMPTS = 3

export type PublishOptions = {
  src: string // path relative to root (or absolute), must be under eval/results/novel
  dest: string // under docs/eval/novel, ends with .md
  root?: string // default process.cwd()
  attempts?: number // default 3
  ifMissing?: boolean // skip when dest exists
  copy?: (src: string, dest: string) => void // test seam, default fs.copyFileSync
}

export type PublishResult = {
  status: 'copied' | 'skipped' | 'failed'
  dest: string // absolute
  error: string | null
  attempts: number // copy attempts made
}

/** True when abs is inside base (not base itself, and not above it). */
function isInside(base: string, abs: string): boolean {
  const rel = path.relative(base, abs)
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return false
  }
  return true
}

export function publishFile(o: PublishOptions): PublishResult {
  const root = o.root ?? process.cwd()
  const src = path.resolve(root, o.src)
  const dest = path.resolve(root, o.dest)
  const srcBase = path.resolve(root, SRC_BASE)
  const destBase = path.resolve(root, DEST_BASE)
  if (!isInside(srcBase, src) || !isInside(destBase, dest) || !dest.endsWith('.md')) {
    throw new Error('publish: src must be under eval/results/novel and dest under docs/eval/novel')
  }

  if (!existsSync(src)) {
    return { status: 'failed', dest, error: `source not found: ${src}`, attempts: 0 }
  }
  if (o.ifMissing && existsSync(dest)) {
    return { status: 'skipped', dest, error: null, attempts: 0 }
  }

  const copy = o.copy ?? copyFileSync
  const limit = Math.max(1, o.attempts ?? DEFAULT_ATTEMPTS)
  let error = ''
  for (let attempt = 1; attempt <= limit; attempt++) {
    try {
      mkdirSync(path.dirname(dest), { recursive: true })
      copy(src, dest)
      return { status: 'copied', dest, error: null, attempts: attempt }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }
  return { status: 'failed', dest, error, attempts: limit }
}
