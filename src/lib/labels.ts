// Korean labels for database enum values. Keys are the stored values from src/db/types.ts.
import type {
  ChapterStatus,
  ContextTier,
  DirectiveKind,
  DirectiveScope,
  DirectiveSource,
  DirectiveStatus,
  EntryKind,
  FactSourceType,
  FactStatus,
  Importance,
  IssueKind,
  IssueStatus,
  ProposalSource,
  ProposalType,
  Role,
  ScheduleKind,
  Severity,
  SpeechLevel,
  ThreadEventKind,
  ThreadStatus,
} from '@/db/types'

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  character: '인물',
  place: '장소',
  organization: '조직',
  item: '물건',
  rule: '규칙',
  event: '사건',
  term: '용어',
  other: '기타',
}

export const CONTEXT_TIER_LABEL: Record<ContextTier, string> = {
  always: '항상 넣기',
  mention: '이름이 나오면 넣기',
  never: '넣지 않기',
}

export const DIRECTIVE_SCOPE_LABEL: Record<DirectiveScope, string> = {
  work: '작품 전체',
  character: '인물',
  chapter: '한 회차만',
}

export const DIRECTIVE_KIND_LABEL: Record<DirectiveKind, string> = {
  style: '문체',
  speech: '말투',
  ban: '쓰지 않을 말',
  length: '분량',
  content: '내용',
}

export const DIRECTIVE_STATUS_LABEL: Record<DirectiveStatus, string> = {
  active: '적용 중',
  off: '꺼 둠',
}

export const DIRECTIVE_SOURCE_LABEL: Record<DirectiveSource, string> = {
  author: '작가',
  instruction: '지시',
  revision: '계획 수정',
  suggested: 'AI 제안',
}

export const SPEECH_LEVEL_LABEL: Record<SpeechLevel, string> = {
  banmal: '반말',
  jondaet: '존댓말',
}

export const FACT_STATUS_LABEL: Record<FactStatus, string> = {
  confirmed: '확정',
  assumed: '가정',
  undecided: '미정',
}

export const SOURCE_TYPE_LABEL: Record<FactSourceType, string> = {
  chapter: '회차',
  interview: '인터뷰',
  author: '작가 입력',
  import: '가져오기',
}

export const THREAD_STATUS_LABEL: Record<ThreadStatus, string> = {
  planned: '계획됨',
  planted: '심음',
  developing: '발전 중',
  resolved: '회수',
  discarded: '폐기',
}

export const THREAD_EVENT_LABEL: Record<ThreadEventKind, string> = {
  planted: '심음',
  developed: '발전',
  resolved: '회수',
  discarded: '폐기',
  note: '메모',
}

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: '소유자',
  editor: '편집자',
  commenter: '코멘트 작성자',
  viewer: '보기 전용',
}

export const ISSUE_KIND_LABEL: Record<IssueKind, string> = {
  contradiction: '설정 충돌',
  naming: '표기 불일치',
  timeline: '시간선',
  thread: '떡밥',
  character: '인물',
  other: '기타',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
}

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  open: '확인 필요',
  accepted: '고침',
  dismissed: '무시',
  wiki_updated: '위키 수정',
}

export const PROPOSAL_TYPE_LABEL: Record<ProposalType, string> = {
  entry_create: '새 카드',
  entry_update: '카드 수정',
  fact_create: '새 사실',
  thread_create: '새 떡밥',
  thread_event: '떡밥 기록',
  relation_create: '새 관계',
  chapter_summary: '회차 요약',
  style_card: '문체 카드',
}

export const PROPOSAL_SOURCE_LABEL: Record<ProposalSource, string> = {
  interview: '인터뷰',
  import: '원고 가져오기',
  post_chapter: '회차 점검',
  style: '문체 제안',
  manual: '직접 입력',
}

export const CHAPTER_STATUS_LABEL: Record<ChapterStatus, string> = {
  draft: '초안',
  done: '완료',
}

export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  deadline: '마감',
  publish: '연재',
  hiatus: '휴재',
  event: '기타 일정',
}

export const CHARACTER_FIELD_LABELS = {
  role: '역할',
  age: '나이',
  gender: '성별',
  appearance: '외모',
  personality: '성격',
  speech: '말투',
  goal: '목표',
  background: '배경',
} as const

export const PLACE_FIELD_LABELS = {
  location: '위치',
  features: '특징',
} as const

// A leading `1화` / `제1화` followed by a boundary (end, space or a separator), plus the separators after it.
// The number is captured so it can be compared with the chapter's own position.
const EPISODE_PREFIX_RE = /^(?:제\s*)?(\d+)\s*화(?=$|[\s.:·\-–—)\]])[\s.:·\-–—)\]]*/

/**
 * Removes a leading episode number from a chapter title, so the number is not printed twice.
 * With `position`, only that chapter's own number is removed: "2화 이후의 이야기" on chapter 3 keeps
 * its text. Without `position`, any leading episode number is removed (the import heading path).
 */
export function stripEpisodePrefix(title: string, position?: number): string {
  const trimmed = title.trim()
  const match = EPISODE_PREFIX_RE.exec(trimmed)
  if (!match) return trimmed
  if (position !== undefined && Number(match[1]) !== position) return trimmed
  return trimmed.slice(match[0].length).trim()
}

/** `3화` or `3화 재회` when a title is given. */
export function chapterLabel(position: number, title?: string | null): string {
  const t = stripEpisodePrefix(title ?? '', position)
  return t ? `${position}화 ${t}` : `${position}화`
}
