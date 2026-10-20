import type { DraftPlan } from '@/ai/tasks/draft-plan'

// Stand-in output for the draft-plan task. Used only by tests (see src/test/fake-ai.ts).

/** Demo output: three scenes, opening to ending, with one demo character. */
export function fakeDraftPlan(): DraftPlan {
  const character = '(데모) 인물'
  return {
    scenes: [
      {
        summary: '(데모) 인물이 편지를 찾는다.',
        goal: '편지의 주인을 알아낸다.',
        decision: '',
        stake: '',
        trigger: '',
        role: 'opening',
        place: '도서관',
        characters: [character],
      },
      {
        summary: '(데모) 인물이 상대와 마주한다.',
        goal: '진실을 듣는다.',
        decision: '끝까지 추적하기로 정한다.',
        stake: '시간을 잃는다.',
        trigger: '상대가 편지의 필적을 알아본다.',
        role: 'turn',
        place: '복도',
        characters: [character],
      },
      {
        summary: '(데모) 인물이 문을 연다.',
        goal: '다음 단서를 찾는다.',
        decision: '',
        stake: '',
        trigger: '',
        role: 'ending',
        place: '계단',
        characters: [character],
      },
    ],
    ending: { device: 'question', line: '문틈으로 누군가의 발소리가 들린다.' },
    threads: [],
  }
}
