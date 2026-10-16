import type { ProposalType } from '@/db/types'
import { ENTRY_KIND_LABEL, THREAD_EVENT_LABEL } from '@/lib/labels'

// Human-readable Korean summary of a proposal payload. Client-safe: no server imports.
// Payloads reach this module from the database, so every field is read defensively.

export type ProposalSummary = {
  headline: string
  detail: string | null
}

type Json = Record<string, unknown>

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function orNull(text: string): string | null {
  return text.length > 0 ? text : null
}

export function summarizeProposal(type: ProposalType, payload: unknown): ProposalSummary {
  const p: Json = payload && typeof payload === 'object' ? (payload as Json) : {}
  switch (type) {
    case 'entry_create': {
      const kind = ENTRY_KIND_LABEL[p.kind as keyof typeof ENTRY_KIND_LABEL] ?? '카드'
      const aliases = list(p.aliases).filter(Boolean)
      const aliasText = aliases.length > 0 ? ` (별칭: ${aliases.join(', ')})` : ''
      return {
        headline: `${kind} '${str(p.name)}' 추가${aliasText}`,
        detail: orNull(str(p.summary)),
      }
    }
    case 'entry_update': {
      const patch: Json = p.patch && typeof p.patch === 'object' ? (p.patch as Json) : {}
      const changed = [
        patch.summary !== undefined ? '요약' : null,
        patch.aliases !== undefined ? '별칭' : null,
        patch.fields !== undefined ? '설정 항목' : null,
      ].filter((v): v is string => v !== null)
      return {
        headline: `'${str(p.entryName)}' 카드 수정`,
        detail: changed.length > 0 ? `바뀌는 내용: ${changed.join(', ')}` : null,
      }
    }
    case 'fact_create': {
      const subject = str(p.subjectName)
      const supersedes = typeof p.supersedesFactId === 'string' && p.supersedesFactId.length > 0
      const parts = [subject ? `대상: ${subject}` : null, supersedes ? '이 회차부터 바뀜' : null]
      return {
        headline: str(p.content),
        detail: orNull(parts.filter((v): v is string => v !== null).join(' · ')),
      }
    }
    case 'thread_create':
      return {
        headline: `떡밥 '${str(p.title)}' 추가`,
        detail: orNull(str(p.description)),
      }
    case 'thread_event': {
      const kind = THREAD_EVENT_LABEL[p.kind as keyof typeof THREAD_EVENT_LABEL] ?? '기록'
      return {
        headline: `떡밥 '${str(p.threadTitle)}' ${kind}`,
        detail: orNull(str(p.note)),
      }
    }
    case 'relation_create':
      return {
        headline: `'${str(p.sourceName)}' - '${str(p.targetName)}' 관계 (${str(p.kind)})`,
        detail: orNull(str(p.description)),
      }
    case 'chapter_summary':
      return { headline: '회차 요약', detail: orNull(str(p.summary)) }
    case 'style_card':
      return {
        headline: `문체 카드 '${str(p.name)}'`,
        detail: orNull(str(p.tone)),
      }
  }
}

/** The quoted source sentence of a proposal, when its type carries one. */
export function evidenceOf(type: ProposalType, payload: unknown): string | null {
  const p: Json = payload && typeof payload === 'object' ? (payload as Json) : {}
  switch (type) {
    case 'fact_create':
    case 'thread_create':
    case 'thread_event':
    case 'relation_create':
      return orNull(str(p.evidence))
    default:
      return null
  }
}
