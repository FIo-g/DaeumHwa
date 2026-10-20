import { directiveBlock } from './directives'
import type { Bible } from './bible'

// The instruction text a chapter gets (stage 0). Full mode is the bible text. Few-instruction mode
// gives only the first sentence. Directives are added to chapter 1 only.

/** The first sentence of a chapter's instructions, up to the first sentence-ending mark and space. */
export function firstSentence(text: string): string {
  const match = /^.+?[.!?。](?=\s|$)/.exec(text.trim())
  return (match?.[0] ?? text).trim()
}

export function chapterInstructions(
  bible: Bible,
  n: number,
  o: { lang: 'ko' | 'en'; directives?: boolean; fewInstructions?: boolean },
): string {
  const spec = bible.chapters[n - 1]
  if (!spec) throw new Error(`bible has no chapter ${n}`)
  const base = o.fewInstructions ? firstSentence(spec.instructions) : spec.instructions
  if (o.directives && n === 1) return `${base}\n\n${directiveBlock(o.lang)}`
  return base
}
