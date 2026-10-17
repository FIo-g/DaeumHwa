import { strToU8, zipSync, type Zippable } from 'fflate'
import type { ExportPayload } from '@/db/types'
import { formatKoreanDateTime } from '@/lib/dates'
import {
  CHARACTER_FIELD_LABELS,
  chapterLabel,
  ENTRY_KIND_LABEL,
  FACT_STATUS_LABEL,
  PLACE_FIELD_LABELS,
  THREAD_EVENT_LABEL,
  THREAD_STATUS_LABEL,
  IMPORTANCE_LABEL,
} from '@/lib/labels'

export type BackupFile = { path: string; content: string }

const MAX_NAME_CHARS = 40
const FALLBACK_NAME = '무제'

/** Builds the owner backup tree from the export payload (spec F5). All paths and text are NFC. */
export function buildBackupFiles(p: ExportPayload): BackupFile[] {
  const chapterPosition = new Map(p.chapters.map((c) => [c.id, c.position]))
  const files: BackupFile[] = []
  const usedPaths = new Set<string>()
  const add = (path: string, content: string, tag: string) => {
    files.push({ path: claimPath(path, tag, usedPaths), content })
  }

  // Archived chapters can share a position with a live one, so the live chapter comes first
  // and keeps the plain file name. Ties fall back to id so the output is deterministic.
  const orderedChapters = [...p.chapters].sort(
    (a, b) =>
      a.position - b.position ||
      Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)) ||
      a.id.localeCompare(b.id),
  )
  for (const chapter of orderedChapters) {
    const archived = Boolean(chapter.archivedAt)
    const name = safeName(chapter.title || `${chapter.position}화`)
    const fileName = archived ? `${name} (보관됨)` : name
    const note = archived ? '> 보관된 회차\n\n' : ''
    add(
      `chapters/${pad3(chapter.position)}-${fileName}.md`,
      `# ${chapterLabel(chapter.position, chapter.title)}\n\n${note}${chapter.body}\n`,
      chapter.id.slice(0, 8),
    )
  }

  const factsByEntry = new Map<string, typeof p.facts>()
  for (const fact of p.facts) {
    if (!fact.entryId) continue
    factsByEntry.set(fact.entryId, [...(factsByEntry.get(fact.entryId) ?? []), fact])
  }
  const unlinkedFacts = p.facts.filter((fact) => !fact.entryId)

  const characters = p.entries.filter((e) => e.kind === 'character')
  const world = p.entries.filter((e) => e.kind !== 'character')

  add(
    'wiki/인물.md',
    renderSections(
      '인물',
      characters.map((entry) => renderEntry(entry, factsByEntry.get(entry.id) ?? [])),
    ),
    'file',
  )

  const worldSections = world.map((entry) => renderEntry(entry, factsByEntry.get(entry.id) ?? []))
  if (unlinkedFacts.length > 0) {
    worldSections.push(['## 기타 사실', ...unlinkedFacts.map(renderFact)].join('\n'))
  }
  add('wiki/세계관.md', renderSections('세계관', worldSections), 'file')

  add(
    'wiki/떡밥.md',
    renderSections(
      '떡밥',
      p.threads.map((thread) => {
        const lines = [
          `## ${thread.title}`,
          `- 상태: ${THREAD_STATUS_LABEL[thread.status]}`,
          `- 중요도: ${IMPORTANCE_LABEL[thread.importance]}`,
        ]
        if (thread.targetChapterPosition !== null) {
          lines.push(`- 목표 회차: ${thread.targetChapterPosition}화`)
        }
        if (thread.description) lines.push('', thread.description)
        const events = p.threadEvents.filter((e) => e.threadId === thread.id)
        if (events.length > 0) {
          lines.push('', '### 기록')
          for (const event of events) {
            const position = event.chapterId ? chapterPosition.get(event.chapterId) : undefined
            const where = position === undefined ? '' : ` (${position}화)`
            lines.push(`- ${THREAD_EVENT_LABEL[event.kind]}${where}: ${event.note}`)
          }
        }
        return lines.join('\n')
      }),
    ),
    'file',
  )

  add(
    'wiki/표기.md',
    renderSections(
      '표기',
      p.namingRules.map((rule) => {
        const lines = [`## ${rule.canonical}`]
        if (rule.variants.length > 0) lines.push(`- 잘못된 표기: ${rule.variants.join(', ')}`)
        if (rule.note) lines.push('', rule.note)
        return lines.join('\n')
      }),
    ),
    'file',
  )

  const history = [...p.changes]
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((change) => `- ${formatKoreanDateTime(change.createdAt)} · ${change.summary}`)
  add('history.md', renderSections('변경 이력', [history.join('\n')]), 'file')

  add('work.json', JSON.stringify(p, null, 2), 'file')

  return files.map((file) => ({
    path: file.path.normalize('NFC'),
    content: file.content.normalize('NFC'),
  }))
}

/** Packs backup files into a zip with UTF-8 names. Refuses duplicate paths instead of dropping one. */
export function zipBackup(files: BackupFile[]): Uint8Array {
  const entries: Zippable = {}
  for (const file of files) {
    if (file.path in entries) {
      throw new Error(`백업 파일 경로가 겹칩니다: ${file.path}`)
    }
    entries[file.path] = strToU8(file.content)
  }
  return zipSync(entries)
}

/**
 * Returns `path`, or a variant that no earlier file uses. Comparison ignores case and uses NFC so
 * the result is also unique on case-insensitive file systems. Variants insert `tag` before the
 * extension, then a counter if needed.
 */
function claimPath(path: string, tag: string, used: Set<string>): string {
  const key = (value: string) => value.normalize('NFC').toLowerCase()
  let candidate = path
  if (used.has(key(candidate))) {
    const dot = path.lastIndexOf('.')
    const stem = path.slice(0, dot)
    const ext = path.slice(dot)
    for (let n = 1; used.has(key(candidate)); n++) {
      const suffix = n === 1 ? tag : `${tag}-${n}`
      candidate = `${stem}-${suffix}${ext}`
    }
  }
  used.add(key(candidate))
  return candidate
}

/** `다음화-백업-<작품명>-<YYYYMMDD>.zip` */
export function backupFileName(title: string, date: string): string {
  return `다음화-백업-${safeName(title)}-${date.replace(/-/g, '')}.zip`.normalize('NFC')
}

/** Makes a string safe as a path segment: reserved characters become `_`, length is capped. */
export function safeName(text: string): string {
  const cleaned = text.replace(/[/\\:*?"<>|]/g, '_').trim()
  const capped = Array.from(cleaned).slice(0, MAX_NAME_CHARS).join('')
  return capped.length > 0 ? capped : FALLBACK_NAME
}

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

function renderSections(title: string, sections: string[]): string {
  const body = sections.length > 0 ? sections.join('\n\n') : '아직 내용이 없습니다.'
  return `# ${title}\n\n${body}\n`
}

function renderEntry(
  entry: ExportPayload['entries'][number],
  facts: ExportPayload['facts'],
): string {
  const lines = [`## ${entry.name}`, `- 종류: ${ENTRY_KIND_LABEL[entry.kind]}`]
  if (entry.aliases.length > 0) lines.push(`- 별칭: ${entry.aliases.join(', ')}`)
  if (entry.summary) lines.push(`- 요약: ${entry.summary}`)

  const labels: Record<string, string> =
    entry.kind === 'character'
      ? CHARACTER_FIELD_LABELS
      : entry.kind === 'place'
        ? PLACE_FIELD_LABELS
        : {}
  for (const [key, value] of Object.entries(entry.fields ?? {})) {
    if (value) lines.push(`- ${labels[key] ?? key}: ${value}`)
  }
  for (const field of entry.customFields ?? []) {
    if (field.value) lines.push(`- ${field.key}: ${field.value}`)
  }
  if (entry.body) lines.push('', entry.body)
  if (facts.length > 0) lines.push('', '### 사실', ...facts.map(renderFact))
  return lines.join('\n')
}

function renderFact(fact: ExportPayload['facts'][number]): string {
  const range: string[] = []
  if (fact.validFromPosition !== null) range.push(`${fact.validFromPosition}화부터`)
  if (fact.validToPosition !== null) range.push(`${fact.validToPosition}화까지`)
  const suffix = range.length > 0 ? ` (${range.join(' ')})` : ''
  return `- [${FACT_STATUS_LABEL[fact.status]}] ${fact.content}${suffix}`
}
