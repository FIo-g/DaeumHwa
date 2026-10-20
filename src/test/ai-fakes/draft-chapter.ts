// Stand-in stream text for the draft-chapter task. Used only by tests (see src/test/fake-ai.ts).

import { draftCharCount } from '@/lib/draft-length'

const FILLER = [
  '그는 잠시 말을 고르다가 천천히 고개를 들었다. 창문 너머로 오후의 빛이 길게 번지고 있었다.',
  '그녀의 목소리는 낮았지만 흔들리지 않았다. 방 안의 공기가 한순간 무겁게 가라앉았다.',
  '아무도 먼저 입을 열지 않았다. 시계 초침 소리만 규칙적으로 이어졌다.',
  '결국 가장 먼저 움직인 쪽은 문가에 서 있던 사람이었다. 그는 짧게 숨을 고르고 발걸음을 옮겼다.',
]

/**
 * Demo output for FakeAiClient: the instructions split into six paragraphs, each padded
 * with fixed filler sentences so the text is always at least 600 characters.
 */
export function fakeDraft(input: { instructions: string }): string {
  const parts = input.instructions
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const paragraphs: string[] = []
  for (let i = 0; i < 6; i++) {
    const own = parts.filter((_, j) => j % 6 === i)
    const lead = own.length > 0 ? `${own.join('. ')}.` : `장면 ${i + 1}의 흐름을 이어 갑니다.`
    paragraphs.push(`${lead} ${FILLER[i % FILLER.length]} ${FILLER[(i + 1) % FILLER.length]}`)
  }
  return `(데모 초안) ${paragraphs.join('\n\n')}`
}

/**
 * Demo continuation for 'draft-continue': the filler paragraphs four times over, so the text is
 * always at least 600 characters and reads as a separate part of the draft.
 */
export function fakeDraftContinue(): string {
  return `(데모 이어쓰기) ${[...FILLER, ...FILLER, ...FILLER, ...FILLER].join('\n\n')}`
}

/**
 * Demo scene for 'draft-scene': two filler paragraphs, so a scenes-mode draft with the demo plan
 * writes every scene instead of stopping after the first.
 */
export function fakeDraftScene(): string {
  return `(데모 장면) ${FILLER.slice(0, 2).join('\n\n')}`
}

/** Subjects and predicates for the sentences of 'draft-expand': each pair is a distinct sentence. */
const EXPAND_SUBJECTS = [
  '창밖의 빗소리가',
  '복도 끝의 불빛이',
  '식어 가는 찻잔의 김이',
  '문틈으로 스민 바람이',
  '벽에 걸린 시계 소리가',
  '마당의 젖은 나뭇잎이',
]
const EXPAND_PREDICATES = [
  '조금씩 잦아들고 있었다.',
  '천천히 흔들리고 있었다.',
  '한동안 그대로 머물러 있었다.',
  '흐릿하게 번져 가고 있었다.',
  '낮게 가라앉고 있었다.',
  '희미하게 떨리고 있었다.',
]

/**
 * Demo rewrite for 'draft-expand'. The task input holds only the instructions, so the rewrite does
 * not echo a span. It is the instructions, then distinct new sentences until it is 1.05 times as
 * long as the whole demo draft, which is at least as long as any span of it. Every new sentence
 * occurs once and is not in FILLER, so acceptExpansion passes for every span of a fake draft.
 */
export function fakeDraftExpand(input: { instructions: string }): string {
  const target = draftCharCount(fakeDraft(input)) * 1.05
  const parts = input.instructions
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  let text = `(데모 확장) ${parts.join('. ')}${parts.length > 0 ? '.' : ''}`
  for (const subject of EXPAND_SUBJECTS) {
    for (const predicate of EXPAND_PREDICATES) {
      if (draftCharCount(text) >= target) return text
      text = `${text} ${subject} ${predicate}`
    }
  }
  return text
}
