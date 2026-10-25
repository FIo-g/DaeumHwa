import { z } from 'zod'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'
import { type DirectiveForPrompt, withRequestsBlock } from '@/lib/directives'
import { isVagueRequest, type EditHunk } from '@/lib/edit-hunks'

// Lasting requests inferred from the author's edits to an AI draft (stage 4, task 1). The
// inference only ever sees edit hunks, never the whole chapter. Proposals become ledger rows
// only when the author presses add, through createDirective with source 'inferred'.

export type DirectiveInferInput = {
  /** Edit hunks between the AI text and the saved chapter, in text order. */
  hunks: EditHunk[]
  /** Every non-archived request, so known ones are not proposed again. */
  requests: DirectiveForPrompt[]
  /** Character names the entryName of a proposal must come from. */
  names: string[]
}

export const DIRECTIVE_INFER_KINDS = ['style', 'speech', 'ban', 'content'] as const
export type DirectiveInferKind = (typeof DIRECTIVE_INFER_KINDS)[number]

export type DirectiveInferProposal = {
  text: string
  kind: DirectiveInferKind
  entryName: string | null
  pattern: string | null
  /** 1-based hunk indexes backing the proposal. */
  evidence: number[]
}

export type DirectiveInferOutput = { proposals: DirectiveInferProposal[] }

export const DirectiveInferSchema: z.ZodType<DirectiveInferOutput> = z.object({
  proposals: z
    .array(
      z.object({
        text: z.string().max(120),
        kind: z.enum(DIRECTIVE_INFER_KINDS),
        entryName: z.string().nullable(),
        pattern: z.string().nullable(),
        evidence: z.array(z.number().int().min(1)).max(3),
      }),
    )
    .max(2),
})

export const DIRECTIVE_INFER_SYSTEM = `너는 웹소설 작가가 AI 초안을 고친 흔적에서 계속 지킬 요청을 찾는 보조 작가다.
- <edits>의 [수정 N]마다 전과 후를 비교한다. 작가가 고친 것만 보고 판단한다.
- 이번 화의 사건 하나를 고친 일회성 수정, 맞춤법과 오타 수정, <author_requests>에 이미 있는 요청은 제안하지 않는다.
- 매 화에 지키고 싶은 규칙을 최대 두 개까지 찾는다. 각 규칙은 두 군데 이상의 수정에 뒷받침되거나, 한 군데의 수정이 분명한 반복 패턴(한 표현을 여러 곳에서 지우기 등)을 보여야 한다.
- 각 제안은 한 문장으로 쓴다. 금지할 말, 인물의 이름이나 말투, 지켜야 할 형태를 구체적으로 적어 작가가 바로 지킬 수 있게 한다.
- text는 120자 이내의 한국어 한 문장이다.
- 분명한 규칙이 없으면 {"proposals": []}를 돌려준다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

export const directiveInferTask: AiTaskDef<DirectiveInferInput, DirectiveInferOutput> = {
  name: 'directive-infer',
  effort: 'low',
  maxTokens: 2000,
  system: DIRECTIVE_INFER_SYSTEM,
  buildPrompt: (raw) => {
    const input = neutralizeDeep(raw)
    const edits = input.hunks
      .map((hunk, i) => `[수정 ${i + 1}]\n- 전: ${hunk.before}\n- 후: ${hunk.after}`)
      .join('\n')
    return withRequestsBlock(input.requests ?? [], `<edits>\n${edits}\n</edits>`)
  },
  schema: DirectiveInferSchema,
  postProcess(output, input) {
    const proposals: DirectiveInferProposal[] = []
    for (const proposal of output.proposals) {
      if (proposal.evidence.length === 0) continue
      if (proposal.evidence.some((index) => index < 1 || index > input.hunks.length)) continue
      if (proposal.entryName !== null && !input.names.includes(proposal.entryName)) continue
      if (isVagueRequest(proposal.text, input.names)) continue
      proposals.push(proposal)
      if (proposals.length >= 2) break
    }
    return { proposals }
  },
}
