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
