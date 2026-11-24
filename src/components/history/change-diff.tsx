import type { CSSProperties } from 'react'
import { formatKoreanDateTime } from '@/lib/dates'
import {
  CHAPTER_STATUS_LABEL,
  CHARACTER_FIELD_LABELS,
  CONTEXT_TIER_LABEL,
  CREATOR_TYPE_LABEL,
  DIRECTIVE_KIND_LABEL,
  DIRECTIVE_SCOPE_LABEL,
  DIRECTIVE_SOURCE_LABEL,
  DIRECTIVE_STATUS_LABEL,
  ENTRY_KIND_LABEL,
  FACT_STATUS_LABEL,
  IMPORTANCE_LABEL,
  PLACE_FIELD_LABELS,
  SOURCE_TYPE_LABEL,
  SPEECH_LEVEL_LABEL,
  THREAD_EVENT_LABEL,
  THREAD_STATUS_LABEL,
} from '@/lib/labels'
import type { ChangeTargetTable } from '@/db/types'

// Shows the fields that differ between a change's before and after snapshots.
// Ids, timestamps and other internal columns are left out.

type Snapshot = Record<string, unknown>

type ChangeDiffProps = {
  targetTable: ChangeTargetTable
  before: unknown
  after: unknown
}

const FIELD_LABEL: Record<string, string> = {
  name: '이름',
  aliases: '별칭',
  summary: '요약',
  body: '본문',
  fields: '고정 필드',
  customFields: '자유 필드',
  kind: '종류',
  content: '내용',
  status: '상태',
  subjectName: '대상 이름',
  createdByType: '작성 주체',
  sourceType: '출처',
  evidence: '근거',
  validFromPosition: '시작 회차',
  validToPosition: '끝 회차',
  title: '제목',
  description: '설명',
  importance: '중요도',
  targetChapterPosition: '목표 회차',
  note: '메모',
  directed: '방향',
  startPosition: '시작 회차',
  endPosition: '끝 회차',
  canonical: '기준 표기',
  variants: '잘못된 표기',
  tone: '어조',
  rules: '규칙',
  examples: '예문',
  archivedAt: '보관',
  scope: '범위',
  text: '요청',
  pattern: '찾을 말',
  speechLevel: '말투',
  targetChars: '분량',
  chapterPosition: '회차',
  position: '회차',
  publishedOn: '연재일',
  source: '출처',
  contextTier: 'AI 문맥',
  revealAtPosition: '공개 회차',
}

// Keys of structured `fields` objects (character and place cards).
const SUBFIELD_LABEL: Record<string, string> = {
  ...CHARACTER_FIELD_LABELS,
  ...PLACE_FIELD_LABELS,
}

const SKIPPED_KEYS = new Set([
  'id',
  'workId',
  'entryId',
  'sourceChapterId',
  'supersededByFactId',
  'plantedChapterId',
  'resolvedChapterId',
  'relatedEntryIds',
  'threadId',
  'chapterId',
  'sourceEntryId',
  'targetEntryId',
  'createdAt',
  'updatedAt',
  'createdBy',
  'reopenedPredecessor',
  'version',
  'charCount',
  'charCountNoSpaces',
])

type CodeLabels = Readonly<Record<string, string>>

const SHARED_CODES: Readonly<Record<string, CodeLabels>> = {
  contextTier: CONTEXT_TIER_LABEL,
  createdByType: CREATOR_TYPE_LABEL,
}

const TABLE_CODES: Partial<Record<ChangeTargetTable, Readonly<Record<string, CodeLabels>>>> = {
  wiki_entries: { kind: ENTRY_KIND_LABEL },
  facts: { status: FACT_STATUS_LABEL, sourceType: SOURCE_TYPE_LABEL },
  threads: { status: THREAD_STATUS_LABEL, importance: IMPORTANCE_LABEL },
  thread_events: { kind: THREAD_EVENT_LABEL },
  chapters: { status: CHAPTER_STATUS_LABEL },
  author_directives: {
    status: DIRECTIVE_STATUS_LABEL,
    kind: DIRECTIVE_KIND_LABEL,
    scope: DIRECTIVE_SCOPE_LABEL,
    source: DIRECTIVE_SOURCE_LABEL,
    speechLevel: SPEECH_LEVEL_LABEL,
  },
}

function asSnapshot(value: unknown): Snapshot {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Snapshot) : {}
}

function fieldLabel(key: string, targetTable: ChangeTargetTable): string {
  return key === 'status' && targetTable === 'facts' ? '태그' : FIELD_LABEL[key]
}

function codeLabel(key: string, targetTable: ChangeTargetTable, value: string): string {
  const labels = TABLE_CODES[targetTable]?.[key] ?? SHARED_CODES[key]
  if (!labels) return value
  return Object.hasOwn(labels, value) ? labels[value] : '알 수 없음'
}

function formatValue(key: string, targetTable: ChangeTargetTable, value: unknown): string {
  if (value === null || value === undefined || value === '') return '없음'
  if (key === 'archivedAt') return value ? '보관됨' : '보관 안 됨'
  if (typeof value === 'boolean') return value ? '예' : '아니요'
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatKoreanDateTime(value)
    return codeLabel(key, targetTable, value)
  }
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '없음'
    return value.map((item) => formatValue(key, targetTable, item)).join(', ')
  }
  if (typeof value === 'object') {
    const entry = value as Snapshot
    if (key === 'customFields' && typeof entry.key === 'string' && typeof entry.value === 'string')
      return `${entry.key}: ${entry.value}`
    const pairs = Object.entries(entry)
      .filter(
        ([k, v]) => key === 'fields' && Object.hasOwn(SUBFIELD_LABEL, k) && typeof v === 'string',
      )
      .map(([k, v]) => `${SUBFIELD_LABEL[k]}: ${v}`)
    return pairs.length > 0 ? pairs.join(', ') : '없음'
  }
  return String(value)
}

export function ChangeDiff({ targetTable, before, after }: ChangeDiffProps) {
  const b = asSnapshot(before)
  const a = asSnapshot(after)
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (key) => !SKIPPED_KEYS.has(key) && Object.hasOwn(FIELD_LABEL, key),
  )
  const changed = keys.filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))

  if (changed.length === 0) {
    return <p className="wg-history-diff-empty">바뀐 내용이 없어요.</p>
  }

  return (
    <dl className="wg-history-diff">
      {changed.map((key, index) => {
        const previous = formatValue(key, targetTable, b[key])
        const next = formatValue(key, targetTable, a[key])
        return (
          <div
            key={key}
            className="wg-history-diff-row"
            style={{ '--wg-history-order': Math.min(index, 8) } as CSSProperties}
          >
            <dt>{fieldLabel(key, targetTable)}</dt>
            <dd>
              <span className="wg-history-diff-before" data-empty={previous === '없음'}>
                {previous}
              </span>
              <span aria-hidden="true">→</span>
              <span className="wg-history-diff-after" data-empty={next === '없음'}>
                {next}
              </span>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
