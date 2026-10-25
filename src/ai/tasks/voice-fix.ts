import { z } from 'zod'
import { bigramDice } from '@/ai/guards/similarity'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'
import type { SpeechLevel } from '@/db/types'
import { speechLevelOf } from '@/lib/directive-check'

// One-line speech-level repairs (stage 3, task 8): the model names the speaker of each numbered
// quoted line and rewrites only the lines that break that speaker's level. The service in
// src/server/draft-check.ts keeps a rewrite only when `acceptVoiceLine` passes.

export type VoiceFixVoice = { name: string; level: SpeechLevel; speech: string }

export type VoiceFixInput = {
  /** The draft with `⟦N⟧` before each quoted line (see `markLines`). */
  marked: string
  voices: VoiceFixVoice[]
}

export type VoiceFixLine = { id: number; speaker: string; text: string }
export type VoiceFixOutput = { lines: VoiceFixLine[] }

export const VoiceFixSchema: z.ZodType<VoiceFixOutput> = z.object({
  lines: z
    .array(
      z.object({
        id: z.number().int(),
        speaker: z.string(),
        text: z.string(),
      }),
    )
    .max(40),
})

export const VOICE_FIX_SYSTEM = `너는 웹소설 대사의 말투를 고치는 보조 작가다.
- 서술과 주고받는 순서로 각 번호 대사를 누가 말했는지 찾는다.
- <voices>에 있는 인물이 말한 대사 중, 그 인물의 말투를 어긴 끝맺음만 고른다. 고른 대사는 누가 말했는지 밝힌다.
- 고친 대사는 그 인물의 말투로 같은 뜻을 살리고 되도록 많은 낱말을 그대로 둔다. 따옴표는 그대로 둔다.
- 다른 대사는 결과에 넣지 않는다. 고칠 대사가 없으면 {"lines": []}를 돌려준다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

function levelLabel(level: SpeechLevel): string {
  return level === 'banmal' ? '반말' : '존댓말'
}

export const voiceFixTask: AiTaskDef<VoiceFixInput, VoiceFixOutput> = {
  name: 'voice-fix',
  effort: 'low',
  maxTokens: 6000,
  system: VOICE_FIX_SYSTEM,
  buildPrompt: (raw) => {
    const input = neutralizeDeep(raw)
    const voices =
      input.voices.length > 0
        ? input.voices
            .map((voice) => `- ${voice.name}: ${levelLabel(voice.level)} (${voice.speech})`)
            .join('\n')
        : '(없음)'
    return [`<voices>\n${voices}\n</voices>`, '', `<draft>\n${input.marked}\n</draft>`].join('\n')
  },
  schema: VoiceFixSchema,
}

/**
 * A rewritten line is usable when it ends in the speaker's level, keeps at least half of the
 * line's words (bigram Dice ≥ 0.5, or on a line of at most 8 characters the same opening quote
 * and first syllable), keeps the opening and closing quote marks, has no newline and runs
 * 50–200% of the original length. For `banmal`, dropping a recognized polite ending counts as
 * the speaker's level: a fix `speechLevelOf` does not recognize is accepted when the original
 * reads as `jondaet`, since plain endings are open-ended. For `jondaet`, the fix must read as
 * `jondaet`.
 */
export function acceptVoiceLine(original: string, fixed: string, level: SpeechLevel): boolean {
  if (original.length === 0 || fixed.length === 0) return false
  const fixedLevel = speechLevelOf(fixed)
  if (level === 'banmal') {
    if (
      fixedLevel !== 'banmal' &&
      !(fixedLevel === null && speechLevelOf(original) === 'jondaet')
    ) {
      return false
    }
  } else if (fixedLevel !== level) {
    return false
  }
  if (!similarEnough(original, fixed)) return false
  if (fixed[0] !== original[0]) return false
  if (fixed[fixed.length - 1] !== original[original.length - 1]) return false
  if (fixed.includes('\n')) return false
  const before = Array.from(original).length
  const after = Array.from(fixed).length
  if (before === 0) return false
  const ratio = after / before
  if (ratio < 0.5 || ratio > 2) return false
  return true
}

/**
 * The word-keeping check: bigram Dice ≥ 0.5, or on an original of at most 8 characters
 * (quote marks included) the same first two characters (the opening quote and the first
 * syllable), since changing only the ending moves most bigrams of a short line.
 */
function similarEnough(original: string, fixed: string): boolean {
  if (bigramDice(original, fixed) >= 0.5) return true
  if (Array.from(original).length > 8) return false
  const before = Array.from(original)
  const after = Array.from(fixed)
  return before.length >= 2 && after.length >= 2 && before[0] === after[0] && before[1] === after[1]
}
