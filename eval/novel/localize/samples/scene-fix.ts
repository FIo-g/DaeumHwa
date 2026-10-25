import { sceneFixTask, type SceneFixInput } from '@/ai/tasks/scene-fix'

// The scene-fix prompt for one English scene: a style card, a ban request, the plan scene, the
// neighbouring paragraphs and two problems, so every block is exercised.
export const sceneFixInput: SceneFixInput = {
  scene: 'Mina stood at the gate. She did not move.',
  before: 'Mina ran down the stairs.\nMina reached the gate.',
  after: 'Jun closed the gate.',
  reasons: [
    { label: 'skipped moment', note: 'The arrival is told in summary.' },
    { label: 'flat feeling', note: 'Her fear changes with no cause.' },
  ],
  planScene: 'Mina arrives at the gate.',
  requests: [
    {
      id: 'ban-1',
      scope: 'work',
      kind: 'ban',
      text: "Do not write 'for a moment'.",
      pattern: 'for a moment',
      speechLevel: null,
      targetChars: null,
      chapterPosition: null,
      entryId: null,
      entryName: null,
    },
  ],
  styleCards: [
    {
      name: 'Mina plain speech',
      entryName: 'Mina',
      tone: 'Short and plain.',
      rules: 'Uses short sentences.',
      examples: '"I am here."',
    },
  ],
}

export const sceneFixSample = sceneFixTask.buildPrompt(sceneFixInput)
