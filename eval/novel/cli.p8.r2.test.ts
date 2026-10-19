import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initRun, resummarizeRun } from './cli'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('resummarize paragraphOpeners (P8)', () => {
  it('writes paragraphOpeners to metrics/NN.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'novel-cli-p8-'))
    dirs.push(root)
    const dir = join(root, 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    mkdirSync(join(dir, 'chapters'), { recursive: true })
    mkdirSync(join(dir, 'metrics'), { recursive: true })
    writeFileSync(
      join(dir, 'chapters', '01.md'),
      [
        '세린은 문을 열었다.',
        '세린이 웃었다.',
        '세린은 멈췄다.',
        '세린의 손이 떨렸다.',
        '"가자."',
      ].join('\n') + '\n',
    )

    resummarizeRun(dir)

    const metrics = JSON.parse(readFileSync(join(dir, 'metrics', '01.json'), 'utf8'))
    expect(metrics.paragraphOpeners).toEqual({
      counted: 4,
      repeated: 4,
      top: [{ word: '세린', count: 4 }],
    })
  })
})
