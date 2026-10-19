import type { DraftBeats } from '@/ai/tasks/draft-beats'

// Stand-in output for the draft-beats task. Used only by tests (see src/test/fake-ai.ts).
// Each sentence of the instructions becomes one scene (at most three), so the list is never empty.
export function fakeDraftBeats(input: { instructions: string }): DraftBeats {
  const sentences = input.instructions
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 3)
  if (sentences.length === 0) sentences.push('장면을 이어 갑니다.')
  return {
    scenes: sentences.map((sentence, i) => ({
      place: `장소 ${i + 1}`,
      characters: ['등장인물'],
      objects: [],
      sequence: [sentence],
    })),
  }
}
