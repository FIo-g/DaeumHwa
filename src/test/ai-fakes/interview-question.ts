import {
  INTERVIEW_TOPICS,
  type InterviewQuestion,
  type InterviewQuestionInput,
} from '@/ai/tasks/interview-question'

// Stand-in output for the interview-question task. Used only by tests (see src/test/fake-ai.ts).

const STORY_QUESTION: InterviewQuestion = {
  focus: 'story',
  topic: '다음 전개',
  question: '다음 화에서는 무엇이 벌어지나요?',
  rationale: '연재를 이어 갈 다음 전개를 정합니다.',
}

const FAKE_QUESTIONS: Record<(typeof INTERVIEW_TOPICS)[number], InterviewQuestion> = {
  주인공: {
    focus: 'setting',
    topic: '주인공',
    question: '주인공은 누구이고, 이야기가 시작될 때 무엇을 가장 원하나요?',
    rationale: '주인공 카드와 시작 동기를 채웁니다.',
  },
  '주요 인물': {
    focus: 'setting',
    topic: '주요 인물',
    question:
      '주인공 곁에서 이야기를 움직이는 중요한 인물은 누구인가요? 주인공과의 관계도 알려 주세요.',
    rationale: '주요 인물 카드와 인물 관계를 채웁니다.',
  },
  '세계관 규칙': {
    focus: 'setting',
    topic: '세계관 규칙',
    question: '이 세계에서 절대 어기면 안 되는 규칙이나 능력의 한계는 무엇인가요?',
    rationale: '세계관 규칙 카드를 채웁니다.',
  },
  '주요 장소': {
    focus: 'setting',
    topic: '주요 장소',
    question: '이야기의 중심이 되는 장소는 어디이고, 그곳은 어떤 곳인가요?',
    rationale: '장소 카드를 채웁니다.',
  },
  '중심 갈등': {
    focus: 'setting',
    topic: '중심 갈등',
    question: '주인공이 넘어야 할 가장 큰 갈등이나 장애물은 무엇인가요?',
    rationale: '주인공의 목표와 갈등 사실을 채웁니다.',
  },
  떡밥: {
    focus: 'setting',
    topic: '떡밥',
    question: '독자에게 아직 밝히지 않은 비밀이나 나중에 회수할 복선이 있나요?',
    rationale: '앞으로 풀 떡밥 목록을 채웁니다.',
  },
  '결말 방향': {
    focus: 'setting',
    topic: '결말 방향',
    question: '이야기가 끝날 때 주인공은 어떤 모습이 되어 있기를 바라나요?',
    rationale: '결말 방향 사실을 채웁니다.',
  },
  문체: {
    focus: 'setting',
    topic: '문체',
    question: '문장 톤이나 서술 방식에서 꼭 지키고 싶은 원칙이 있나요?',
    rationale: '문체 카드의 기초를 채웁니다.',
  },
}

/** Picks the first core topic that has not been covered, then a story question. */
export function fakeInterviewQuestion(input: InterviewQuestionInput): InterviewQuestion {
  if (input.plan?.storyDue) return { ...STORY_QUESTION }
  const covered = new Set(input.covered.map((turn) => turn.topic))
  const next = INTERVIEW_TOPICS.find((topic) => !covered.has(topic))
  if (next) return { ...FAKE_QUESTIONS[next] }
  return { ...STORY_QUESTION }
}
