import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { backupFileName, buildBackupFiles, safeName, zipBackup } from '@/lib/backup'
import type { ExportPayload } from '@/db/types'

const payload = {
  format: 'daeumhwa-backup',
  version: 1,
  exportedAt: '2026-10-16T00:00:00.000Z',
  work: { id: 'w1', title: '나의 작품', settings: {} },
  chapters: [
    {
      id: 'c2',
      position: 2,
      title: '만남',
      body: '둘째 화 본문',
      status: 'draft',
      publishedOn: null,
    },
    { id: 'c1', position: 1, title: '시작', body: '첫 화 본문', status: 'done', publishedOn: null },
  ],
  chapterVersions: [],
  comments: [],
  issues: [],
  proposals: [],
  interviewSessions: [],
  interviewTurns: [],
  aiRuns: [],
  entries: [
    {
      id: 'e1',
      kind: 'character',
      name: '이서윤',
      aliases: ['서윤'],
      summary: '주인공',
      body: '',
      fields: { age: '17' },
      customFields: [],
    },
    {
      id: 'e2',
      kind: 'place',
      name: '왕국',
      aliases: [],
      summary: '북쪽 왕국',
      body: '',
      fields: {},
      customFields: [],
    },
  ],
  facts: [
    {
      id: 'f1',
      entryId: 'e1',
      content: '서윤은 검을 쓴다',
      status: 'confirmed',
      validFromPosition: null,
      validToPosition: null,
    },
  ],
  threads: [
    {
      id: 't1',
      title: '잃어버린 반지',
      description: '반지의 행방',
      status: 'planted',
      targetChapterPosition: 10,
      importance: 'high',
    },
  ],
  threadEvents: [{ id: 'te1', threadId: 't1', kind: 'planted', note: '1화에서 심음' }],
  threadEntries: [],
  relations: [],
  namingRules: [{ id: 'n1', canonical: '레이아', variants: ['레이야'], note: '' }],
  styleCards: [],
  changes: [
    {
      id: 'ch1',
      createdAt: '2026-10-15T01:00:00.000Z',
      action: 'create',
      targetTable: 'wiki_entries',
      summary: '인물 추가: 이서윤',
    },
  ],
  scheduleItems: [],
} as unknown as ExportPayload

describe('buildBackupFiles', () => {
  it('lays out the spec file tree', () => {
    const paths = buildBackupFiles(payload).map((f) => f.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        'work.json',
        'chapters/001-시작.md',
        'chapters/002-만남.md',
        'wiki/인물.md',
        'wiki/세계관.md',
        'wiki/떡밥.md',
        'wiki/표기.md',
        'history.md',
      ]),
    )
  })

  it('writes chapter files with a label heading and the body', () => {
    const file = buildBackupFiles(payload).find((f) => f.path === 'chapters/001-시작.md')
    expect(file?.content).toContain('# 1화 시작')
    expect(file?.content).toContain('첫 화 본문')
  })

  it('writes work.json as the full payload', () => {
    const file = buildBackupFiles(payload).find((f) => f.path === 'work.json')
    expect(JSON.parse(file?.content ?? '')).toEqual(JSON.parse(JSON.stringify(payload)))
  })

  it('uses NFC paths', () => {
    for (const f of buildBackupFiles(payload)) {
      expect(f.path).toBe(f.path.normalize('NFC'))
    }
  })
})

describe('zipBackup', () => {
  it('produces a zip whose entries match the file list', () => {
    const files = buildBackupFiles(payload)
    const zip = zipBackup(files)
    const entries = unzipSync(zip)
    expect(Object.keys(entries).sort()).toEqual(files.map((f) => f.path).sort())
    expect(new TextDecoder().decode(entries['wiki/인물.md'])).toContain('이서윤')
  })
})

describe('backupFileName and safeName', () => {
  it('builds the spec file name', () => {
    expect(backupFileName('나의/작품', '2026-10-16')).toBe('다음화-백업-나의_작품-20261016.zip')
  })

  it('replaces reserved characters and trims to 40 characters', () => {
    expect(safeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
    expect(safeName('가'.repeat(50))).toHaveLength(40)
  })
})

describe('chapters that share a position', () => {
  const archived = {
    id: 'old-chapter',
    position: 5,
    title: '5화',
    body: 'ARCHIVED BODY',
    status: 'draft',
    publishedOn: null,
    archivedAt: '2026-10-15T00:00:00.000Z',
  }
  const live = {
    id: 'new-chapter',
    position: 5,
    title: '5화',
    body: 'REAL BODY',
    status: 'draft',
    publishedOn: null,
    archivedAt: null,
  }

  function payloadWith(chapters: unknown[]): ExportPayload {
    return { ...payload, chapters } as unknown as ExportPayload
  }

  it.each([
    ['archived first', [archived, live]],
    ['live first', [live, archived]],
  ])('keeps every chapter file when %s', (_label, chapters) => {
    const files = buildBackupFiles(payloadWith(chapters))
    const paths = files.map((f) => f.path)
    expect(new Set(paths).size).toBe(paths.length)

    const entries = unzipSync(zipBackup(files))
    const bodies = Object.keys(entries)
      .filter((path) => path.startsWith('chapters/'))
      .map((path) => new TextDecoder().decode(entries[path]))
    expect(bodies.some((text) => text.includes('REAL BODY'))).toBe(true)
    expect(bodies.some((text) => text.includes('ARCHIVED BODY'))).toBe(true)
  })

  it('keeps the plain file name for the live chapter and marks the archived one', () => {
    const files = buildBackupFiles(payloadWith([archived, live]))
    const liveFile = files.find((f) => f.path === 'chapters/005-5화.md')
    expect(liveFile?.content).toContain('REAL BODY')
    expect(liveFile?.content).not.toContain('보관된 회차')

    const archivedFile = files.find(
      (f) => f.path.startsWith('chapters/005-') && f.path !== 'chapters/005-5화.md',
    )
    expect(archivedFile?.path).toContain('보관됨')
    expect(archivedFile?.content).toContain('보관된 회차')
    expect(archivedFile?.content).toContain('ARCHIVED BODY')
  })

  it('never produces duplicate paths, even when three chapters share a position', () => {
    const second = { ...archived, id: 'aaaaaaaa1', body: 'SECOND ARCHIVED' }
    const third = { ...archived, id: 'aaaaaaaa2', body: 'THIRD ARCHIVED' }
    const files = buildBackupFiles(payloadWith([second, live, third]))
    const paths = files.map((f) => f.path)
    expect(new Set(paths.map((p) => p.toLowerCase())).size).toBe(paths.length)

    const entries = unzipSync(zipBackup(files))
    const texts = Object.keys(entries).map((path) => new TextDecoder().decode(entries[path]))
    expect(texts.some((text) => text.includes('SECOND ARCHIVED'))).toBe(true)
    expect(texts.some((text) => text.includes('THIRD ARCHIVED'))).toBe(true)
    expect(texts.some((text) => text.includes('REAL BODY'))).toBe(true)
  })
})

describe('zipBackup duplicate guard', () => {
  it('throws instead of silently replacing a file with the same path', () => {
    expect(() =>
      zipBackup([
        { path: 'chapters/001-a.md', content: 'first' },
        { path: 'chapters/001-a.md', content: 'second' },
      ]),
    ).toThrow('백업 파일 경로가 겹칩니다')
  })
})
