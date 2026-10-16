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

  for (const chapter of [...p.chapters].sort((a, b) => a.position - b.position)) {
    const name = safeName(chapter.title || `${chapter.position}화`)
    files.push({
      path: `chapters/${pad3(chapter.position)}-${name}.md`,
      content: `# ${chapterLabel(chapter.position, chapter.title)}\n\n${chapter.body}\n`,
    })
  }

  const factsByEntry = new Map<string, typeof p.facts>()
  for (const fact of p.facts) {
    if (!fact.entryId) continue
    factsByEntry.set(fact.entryId, [...(factsByEntry.get(fact.entryId) ?? []), fact])
  }
  const unlinkedFacts = p.facts.filter((fact) => !fact.entryId)

  const characters = p.entries.filter((e) => e.kind === 'character')
  const world = p.entries.filter((e) => e.kind !== 'character')

  files.push({
    path: 'wiki/인물.md',
    content: renderSections(
      '인물',
      characters.map((entry) => renderEntry(entry, factsByEntry.get(entry.id) ?? [])),
    ),
  })

  const worldSections = world.map((entry) => renderEntry(entry, factsByEntry.get(entry.id) ?? []))
  if (unlinkedFacts.length > 0) {
    worldSections.push(['## 기타 사실', ...unlinkedFacts.map(renderFact)].join('\n'))
  }
  files.push({ path: 'wiki/세계관.md', content: renderSections('세계관', worldSections) })

  files.push({
    path: 'wiki/떡밥.md',
    content: renderSections(
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
  })

  files.push({
    path: 'wiki/표기.md',
    content: renderSections(
      '표기',
      p.namingRules.map((rule) => {
        const lines = [`## ${rule.canonical}`]
        if (rule.variants.length > 0) lines.push(`- 잘못된 표기: ${rule.variants.join(', ')}`)
        if (rule.note) lines.push('', rule.note)
        return lines.join('\n')
      }),
    ),
  })

  const history = [...p.changes]
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((change) => `- ${formatKoreanDateTime(change.createdAt)} · ${change.summary}`)
  files.push({
    path: 'history.md',
    content: renderSections('변경 이력', [history.join('\n')]),
  })

  files.push({ path: 'work.json', content: JSON.stringify(p, null, 2) })

  return files.map((file) => ({
    path: file.path.normalize('NFC'),
    content: file.content.normalize('NFC'),
  }))
}

/** Packs backup files into a zip with UTF-8 names. */
export function zipBackup(files: BackupFile[]): Uint8Array {
  const entries: Zippable = {}
  for (const file of files) entries[file.path] = strToU8(file.content)
  return zipSync(entries)
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
