import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DraftBeats } from '@/ai/tasks/draft-beats'
import type { DraftAttempt } from '../state'
import { writeRunFile } from './util'
import { sceneLocationsOf } from './chapter'

// P3: the location list of the chosen draft attempt, read from its saved beats file.

const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-chapter-p3-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function beatsFile(place: string): string {
  const beats: DraftBeats = {
    scenes: [{ place, characters: ['서윤'], objects: ['편지'], sequence: ['서윤이 들어온다.'] }],
  }
  return JSON.stringify(beats)
}

function attempt(usable: boolean | null, quality: number | null): DraftAttempt {
  return { runId: `run-${Math.random()}`, usable, quality, reason: '' }
}

describe('sceneLocationsOf (P3)', () => {
  it('reads the beats of the usable attempt', () => {
    const dir = newDir()
    writeRunFile(dir, 'chapters/01.attempt-1.beats.json', beatsFile('첫 번째 장소'))
    writeRunFile(dir, 'chapters/01.attempt-2.beats.json', beatsFile('두 번째 장소'))
    const attempts = [attempt(false, 2), attempt(true, 4)]

    const result = sceneLocationsOf(dir, attempts, 1)
    expect(result).toContain('장소: 두 번째 장소')
    expect(result).not.toContain('첫 번째 장소')
  })

  it('reads the best-quality attempt when none is usable', () => {
    const dir = newDir()
    writeRunFile(dir, 'chapters/01.attempt-1.beats.json', beatsFile('높은 점수 장소'))
    writeRunFile(dir, 'chapters/01.attempt-2.beats.json', beatsFile('낮은 점수 장소'))
    const attempts = [attempt(false, 4), attempt(false, 2)]

    expect(sceneLocationsOf(dir, attempts, 1)).toContain('장소: 높은 점수 장소')
  })

  it('uses the chapter number in the file name', () => {
    const dir = newDir()
    writeRunFile(dir, 'chapters/02.attempt-1.beats.json', beatsFile('2화 장소'))
    writeRunFile(dir, 'chapters/01.attempt-1.beats.json', beatsFile('1화 장소'))

    const result = sceneLocationsOf(dir, [attempt(true, 4)], 2)
    expect(result).toContain('장소: 2화 장소')
    expect(result).not.toContain('1화 장소')
  })

  it('is null when the chosen attempt has no beats file', () => {
    const dir = newDir()
    expect(sceneLocationsOf(dir, [attempt(true, 4)], 1)).toBeNull()
  })

  it('is null when there is no attempt', () => {
    const dir = newDir()
    expect(sceneLocationsOf(dir, [], 1)).toBeNull()
  })

  it('is null for a file that is not JSON, not a beat list, or has no scene', () => {
    for (const content of ['not json', '{}', '{"scenes":[]}']) {
      const dir = newDir()
      writeRunFile(dir, 'chapters/01.attempt-1.beats.json', content)
      expect(() => sceneLocationsOf(dir, [attempt(true, 4)], 1)).not.toThrow()
      expect(sceneLocationsOf(dir, [attempt(true, 4)], 1)).toBeNull()
    }
  })
})
