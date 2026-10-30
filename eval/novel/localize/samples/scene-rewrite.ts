import { sceneRewriteTask } from '@/ai/tasks/scene-rewrite'

// The scene-rewrite prompt for one English finding.
export const sceneRewriteSample = sceneRewriteTask.buildPrompt({
  sceneText: 'Mina stood at the gate.',
  findings: [
    {
      quote: 'the gate',
      explanation: 'The gate was locked.',
      wikiExcerpt: 'The gate is locked at night.',
      suggestion: 'Mina waited at the locked gate.',
    },
  ],
  beats: null,
})
