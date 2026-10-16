// Shared filter labels and parsers for the history and approvals pages. Pure module: safe to
// import from server pages and client components alike.
import {
  CHANGE_TARGETS,
  type ChangeTargetTable,
  PROPOSER_TYPES,
  type ProposerType,
} from '@/db/types'

export const HISTORY_PAGE_SIZE = 50

export const CHANGE_TARGET_LABEL: Record<ChangeTargetTable, string> = {
  wiki_entries: '카드',
  facts: '사실',
  threads: '떡밥',
  thread_events: '떡밥 기록',
  relations: '관계',
  naming_rules: '표기',
  style_cards: '문체 카드',
  chapters: '회차 요약',
}

export const PROPOSER_LABEL: Record<ProposerType, string> = {
  ai: 'AI 제안',
  author: '작가',
}

export function parseChangeTarget(value: string | undefined): ChangeTargetTable | undefined {
  return CHANGE_TARGETS.find((target) => target === value)
}

export function parseProposerType(value: string | undefined): ProposerType | undefined {
  return PROPOSER_TYPES.find((type) => type === value)
}
