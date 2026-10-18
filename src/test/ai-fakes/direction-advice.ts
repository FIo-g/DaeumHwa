import type { AdviceInput, AdviceResult } from '@/ai/tasks/direction-advice'

// Stand-in output for the direction-advice task. Used only by tests (see src/test/fake-ai.ts).

/** Demo output: three options built from the first open thread and character, if any. */
export function fakeAdvice(input: AdviceInput): AdviceResult {
  const thread = input.threads[0]?.title
  const character = input.characters[0]?.name
  const threadUse = thread ? [thread] : []
  const characterUse = character ? [character] : []
  const warnings = [
    ...input.threads
      .filter((t) => t.overdue)
      .map((t) => `"${t.title}" 떡밥의 회수 목표가 지났습니다.`),
    ...input.characters
      .filter((c) => c.lastPosition !== null && input.latestPosition - c.lastPosition >= 5)
      .map((c) => `${c.name}이(가) 오래 등장하지 않았습니다.`),
  ]
  return {
    options: [
      {
        title: '(데모) 정면 대결',
        summary: '숨겨 둔 갈등을 드러내고 인물들이 정면으로 부딪힌다.',
        beats: ['갈등이 드러난다', '인물이 선택을 강요받는다', '결과가 다음 화로 이어진다'],
        usesThreads: threadUse,
        involvedCharacters: characterUse,
        risk: '전개가 빨라져 독자가 따라오기 어려울 수 있습니다.',
      },
      {
        title: '(데모) 잠복과 관찰',
        summary: '인물이 한발 물러서 상황을 살피며 단서를 모은다.',
        beats: ['새 단서를 발견한다', '인물이 몰래 조사한다', '의외의 인물이 등장한다'],
        usesThreads: threadUse,
        involvedCharacters: characterUse,
        risk: '긴장이 느슨해질 수 있습니다.',
      },
      {
        title: '(데모) 뜻밖의 동행',
        summary: '적대적이던 인물과 손을 잡고 새로운 관계를 연다.',
        beats: [
          '뜻밖의 제안이 온다',
          '두 인물이 임시로 손을 잡는다',
          '서로의 비밀이 조금씩 드러난다',
        ],
        usesThreads: threadUse,
        involvedCharacters: characterUse,
        risk: '새 인물 필요 여부를 확인해 보세요.',
      },
    ],
    warnings,
    recommendedIndex: 0,
    recommendationReason: '(데모) 열린 떡밥을 가장 직접적으로 회수할 수 있는 방향입니다.',
  }
}
