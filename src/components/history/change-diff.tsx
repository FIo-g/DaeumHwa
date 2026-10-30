import { formatKoreanDateTime } from '@/lib/dates'
import {
  CHARACTER_FIELD_LABELS,
  CONTEXT_TIER_LABEL,
  DIRECTIVE_KIND_LABEL,
  DIRECTIVE_SCOPE_LABEL,
  DIRECTIVE_SOURCE_LABEL,
  DIRECTIVE_STATUS_LABEL,
  ENTRY_KIND_LABEL,
  FACT_STATUS_LABEL,
  PLACE_FIELD_LABELS,
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
  source: '출처',
  contextTier: 'AI 문맥',
  revealAtPosition: '공개 회차',
}

// Keys of structured `fields` objects (character and place cards).
const SUBFIELD_LABEL: Record<string, string> = {
  ...CHARACTER_FIELD_LABELS,
  ...PLACE_FIELD_LABELS,
}

const SKIPPED_KEYS = new Set(['id', 'workId', 'createdAt', 'updatedAt', 'createdBy'])

function asSnapshot(value: unknown): Snapshot {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Snapshot) : {}
}

function isSkipped(key: string): boolean {
  return SKIPPED_KEYS.has(key) || /Ids?$/.test(key)
}

function fieldLabel(key: string, targetTable: ChangeTargetTable): string {
  if (key === 'status') return targetTable === 'facts' ? '태그' : '상태'
  return FIELD_LABEL[key] ?? key
}

/** Looks up a stored code's Korean label, or shows the code when it has none. */
function labelOf(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value
}

function codeLabel(key: string, targetTable: ChangeTargetTable, value: string): string {
  if (key === 'contextTier') return labelOf(CONTEXT_TIER_LABEL, value)
  if (targetTable === 'author_directives') {
    if (key === 'status') return labelOf(DIRECTIVE_STATUS_LABEL, value)
    if (key === 'kind') return labelOf(DIRECTIVE_KIND_LABEL, value)
    if (key === 'scope') return labelOf(DIRECTIVE_SCOPE_LABEL, value)
    if (key === 'source') return labelOf(DIRECTIVE_SOURCE_LABEL, value)
    if (key === 'speechLevel') return labelOf(SPEECH_LEVEL_LABEL, value)
  }
  if (key === 'status') {
    if (targetTable === 'facts')
      return FACT_STATUS_LABEL[value as keyof typeof FACT_STATUS_LABEL] ?? value
    if (targetTable === 'threads') {
      return THREAD_STATUS_LABEL[value as keyof typeof THREAD_STATUS_LABEL] ?? value
    }
  }
  if (key === 'kind') {
    if (targetTable === 'wiki_entries') {
      return ENTRY_KIND_LABEL[value as keyof typeof ENTRY_KIND_LABEL] ?? value
    }
    if (targetTable === 'thread_events') {
      return THREAD_EVENT_LABEL[value as keyof typeof THREAD_EVENT_LABEL] ?? value
    }
  }
  return value
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
    // Custom fields are stored as { key, value } pairs.
    if ('key' in entry && 'value' in entry) return `${String(entry.key)}: ${String(entry.value)}`
    const pairs = Object.entries(entry).map(([k, v]) => `${SUBFIELD_LABEL[k] ?? k}: ${String(v)}`)
    return pairs.length > 0 ? pairs.join(', ') : '없음'
  }
  return String(value)
}

export function ChangeDiff({ targetTable, before, after }: ChangeDiffProps) {
  const b = asSnapshot(before)
  const a = asSnapshot(after)
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !isSkipped(k))
  const changed = keys.filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))

  if (changed.length === 0) {
    return <p className="text-sm text-muted-foreground">바뀐 내용이 없습니다.</p>
  }

  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
      {changed.map((key) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{fieldLabel(key, targetTable)}</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-2 break-words">
            <span className="text-muted-foreground line-through">
              {formatValue(key, targetTable, b[key])}
            </span>
            <span aria-hidden="true">→</span>
            <span>{formatValue(key, targetTable, a[key])}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
