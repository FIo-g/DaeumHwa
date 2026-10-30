import {
  type DraftRepairInput,
  type DraftRepairOutput,
  repairableForeignSpans,
} from '@/ai/tasks/draft-repair'

// Stand-in output for the draft-repair task. Used only by tests (see src/test/fake-ai.ts).
// Sample-copy and repeated-word flags get no edit, so the draft is kept as it is. A foreign-script
// flag gets its own quote with the foreign runs removed.
export function fakeDraftRepair(input: DraftRepairInput): DraftRepairOutput {
  const edits: DraftRepairOutput['edits'] = []
  for (const flag of input.flags) {
    if (flag.kind !== 'foreign-script') continue
    let replacement = flag.quote
    for (const span of [...repairableForeignSpans(flag.quote)].reverse()) {
      replacement = replacement.slice(0, span.start) + replacement.slice(span.end)
    }
    edits.push({ quote: flag.quote, replacement: replacement.replace(/ {2,}/g, ' ').trim() })
  }
  return { edits }
}
