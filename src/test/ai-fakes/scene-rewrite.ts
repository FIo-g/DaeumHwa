import type { SceneRewriteInput, SceneRewriteOutput } from '@/ai/tasks/scene-rewrite'

// Stand-in output for the scene-rewrite task. Used only by tests (see src/test/fake-ai.ts).
// Each finding quote is replaced by its suggestion, or by the first half of the quote plus an
// ellipsis when there is no usable suggestion. Everything else in the scene is kept as it is.
export function fakeSceneRewrite(input: SceneRewriteInput): SceneRewriteOutput {
  let text = input.sceneText
  for (const finding of input.findings) {
    const suggestion = finding.suggestion.trim()
    const replacement =
      suggestion !== '' && suggestion !== finding.quote
        ? suggestion
        : `${finding.quote.slice(0, Math.ceil(finding.quote.length / 2))}…`
    text = text.split(finding.quote).join(replacement)
  }
  return { text }
}
