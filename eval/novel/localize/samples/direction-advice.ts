import { directionAdviceTask } from '@/ai/tasks/direction-advice'

export const directionAdviceSample = directionAdviceTask.buildPrompt({
  work: {
    title: 'The Clock Tower Courier',
    genre: 'mystery',
    logline: 'A courier finds a stopped clock.',
    synopsis: '',
  },
  latestPosition: 3,
  threads: [
    {
      title: 'Locked drawer',
      description: 'Who owns the key?',
      status: 'planted',
      plantedPosition: 2,
      targetPosition: 5,
      overdue: true,
    },
    {
      title: 'Missing brother',
      description: '',
      status: 'planned',
      plantedPosition: null,
      targetPosition: null,
      overdue: false,
    },
  ],
  characters: [
    { name: 'Mina Park', summary: 'A courier', lastPosition: 3, keyFacts: ['Lost a finger'] },
    { name: 'Han Siwoo', summary: '', lastPosition: null, keyFacts: [] },
  ],
  recentSummaries: [{ position: 3, title: 'Midnight', summary: 'Mina climbs the tower.' }],
})
