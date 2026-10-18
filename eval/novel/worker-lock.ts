import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// One detached worker per run directory. The lock is a worker.pid file holding the worker's pid.
// A pid that no longer answers to signal 0 is stale and the lock can be taken over.

const PID_FILE = 'worker.pid'

function pidFile(dir: string): string {
  return path.join(dir, PID_FILE)
}

function readHolder(dir: string): number | null {
  try {
    const pid = Number(readFileSync(pidFile(dir), 'utf8').trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** True when a live process holds the run's worker lock. */
export function workerAlive(dir: string): boolean {
  const holder = readHolder(dir)
  return holder !== null && isAlive(holder)
}

/** Takes the lock for the current process. Returns false when a live worker already holds it. */
export function acquireLock(dir: string): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(pidFile(dir), `${process.pid}\n`, { flag: 'wx' })
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const holder = readHolder(dir)
      if (holder !== null && isAlive(holder)) return false
      rmSync(pidFile(dir), { force: true })
    }
  }
  return false
}

/** Releases the lock only when this process still holds it. */
export function releaseLock(dir: string): void {
  if (readHolder(dir) === process.pid) rmSync(pidFile(dir), { force: true })
}
