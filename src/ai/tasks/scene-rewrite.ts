// Scene rewrite (spec 7, brief D): rewrites one scene of a saved chapter so that the flagged
// sentences agree with the wiki. The service in src/server/scene-rewrite.ts calls it once per
// scene and checks the answer with isAcceptableRewrite before anything is saved.

import { z } from 'zod'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'
import { locateAllQuotes } from '@/lib/korean/sentences'

export type SceneFinding = {
  quote: string
  explanation: string
  wikiExcerpt: string
  suggestion: string
}
export type SceneRewriteInput = {
  sceneText: string
  findings: SceneFinding[]
  beats: string | null
}
export type SceneRewriteOutput = { text: string }

export const SceneRewriteSchema: z.ZodType<SceneRewriteOutput> = z.object({
  text: z.string(),
})

export const SCENE_REWRITE_SYSTEM = `당신은 웹소설 연속성 퇴고를 돕는 보조 작가다. 원고의 한 장면(<scene>)에서 표시된 문제 문장(<findings>)만 고쳐 장면 전체를 다시 쓴다.
규칙:
- <scene>의 장면만 다시 쓴다. 장면 밖의 내용은 다루지 않는다.
- 각 문제 문장은 위키 문장(위키)의 사실과 맞도록 고친다. 제안이 있으면 그 방향을 따른다.
- 사건 순서, 대화, 인물 말투, 문단 나눔은 장면 안에서도 그대로 둔다.
- 새 사건을 더하지 않는다.
- 길이는 원래 장면과 비슷하게 유지한다.
- 문단은 짧게 쓴다. 한 문단은 3문장 이하로 쓴다.
${TAG_DATA_RULE}
- 원고와 같은 언어로 쓴다. 장면 전체를 text에만 쓰고, 설명을 덧붙이지 않는다.`

export const sceneRewriteTask: AiTaskDef<SceneRewriteInput, SceneRewriteOutput> = {
  name: 'scene-rewrite',
  effort: 'medium',
  maxTokens: 8000,
  system: SCENE_REWRITE_SYSTEM,
  buildPrompt: (raw) => {
    const input = neutralizeDeep(raw)
    const lines = [
      '<scene>',
      input.sceneText,
      '</scene>',
      '',
      '<findings>',
      input.findings.map(renderFinding).join('\n'),
      '</findings>',
    ]
    if (input.beats) lines.push('', '<beats>', input.beats, '</beats>')
    return lines.join('\n')
  },
  schema: SceneRewriteSchema,
}

function renderFinding(finding: SceneFinding): string {
  const lines = [
    `- 문제 문장: ${finding.quote}`,
    `  이유: ${finding.explanation}`,
    `  위키: ${finding.wikiExcerpt}`,
  ]
  if (finding.suggestion.trim() !== '') lines.push(`  제안: ${finding.suggestion}`)
  return lines.join('\n')
}

/**
 * True only when the rewrite is usable: not empty, 0.6x to 1.5x the original scene in length, and
 * every distinct quote occurs strictly fewer times than in the original. A quote that also appears
 * elsewhere in the scene is fine, as long as the rewrite removed at least one occurrence.
 */
export function isAcceptableRewrite(
  original: string,
  rewritten: string,
  quotes: string[],
): boolean {
  const before = original.trim()
  const after = rewritten.trim()
  if (before === '' || after === '') return false
  const ratio = after.length / before.length
  if (ratio < 0.6 || ratio > 1.5) return false
  for (const quote of new Set(quotes.map((q) => q.trim()))) {
    if (quote === '') continue
    const countBefore = locateAllQuotes(before, quote, Number.MAX_SAFE_INTEGER).length
    const countAfter = locateAllQuotes(after, quote, Number.MAX_SAFE_INTEGER).length
    if (countAfter >= countBefore) return false
  }
  return true
}
