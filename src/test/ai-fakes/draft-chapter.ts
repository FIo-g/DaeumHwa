// Stand-in stream text for the draft-chapter task. Used only by tests (see src/test/fake-ai.ts).

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
