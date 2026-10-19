import { interviewExtractTask } from '@/ai/tasks/interview-extract'

export const interviewExtractSample = interviewExtractTask.buildPrompt({
  topic: 'protagonist',
  focus: 'setting',
  question: 'Who is Mina?',
  answer: 'Mina is a courier who lost a finger.',
  known: [
    { name: 'Mina Park', kind: 'character', aliases: ['Min'], pending: false },
    { name: 'Han Siwoo', kind: 'character', aliases: [], pending: true },
  ],
  threads: [
    { title: 'Locked drawer', pending: false },
    { title: 'Old debt', pending: true },
  ],
  knownFacts: [{ subjectName: 'Mina Park', content: 'Mina is a courier.', pending: true }],
})
