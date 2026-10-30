import { getAiClient } from '@/ai'
import { type Extraction, mergeExtractionParts } from '@/ai/extraction'
import { isLocalProvider, runAiTask, type AiRunMeta } from '@/ai/run'
import { chapterExtractTask, type ChapterExtractInput } from '@/ai/tasks/chapter-extract'
import {
  chapterExtractFactsTask,
  chapterExtractRelationsTask,
  chapterExtractThreadsTask,
} from '@/ai/tasks/chapter-extract-parts'
import type { AiClient } from '@/ai/types'
import type { Db } from '@/db/client'

// Chapter extraction for the chapter check. One call (cloud) or three sequential part calls
// (local). The output is the same Extraction shape either way, so the caller does not change.

/**
 * Local servers answer slowly, so only they get the split. `AI_EXTRACT_SPLIT=on|off` overrides the
 * provider rule (the eval harness and local runs use it). Cloud providers keep one call.
 */
export function shouldSplitChapterExtract(provider: string): boolean {
  const override = process.env.AI_EXTRACT_SPLIT
  if (override === 'on') return true
  if (override === 'off') return false
  return isLocalProvider(provider)
}

/**
 * Runs chapter extraction. Split: facts, then threads, then relations, one call after another.
 * Relations also see the card names the facts part created. A failing part fails the call at once;
 * the runs that finished before it stay stored. `runId` is the facts run (the source of the
 * post_chapter proposals).
 */
export async function runChapterExtract(
  db: Db,
  meta: AiRunMeta,
  input: ChapterExtractInput,
  client?: AiClient,
  options?: { split?: boolean },
): Promise<{ output: Extraction; runId: string; runIds: string[] }> {
  const c = client ?? getAiClient()
  const split = options?.split ?? shouldSplitChapterExtract(c.provider)
  if (!split) {
    const result = await runAiTask(db, meta, chapterExtractTask, input, c)
    return { output: result.output, runId: result.runId, runIds: [result.runId] }
  }

  const facts = await runAiTask(db, meta, chapterExtractFactsTask, input, c)
  const threads = await runAiTask(db, meta, chapterExtractThreadsTask, input, c)
  const newCards = facts.output.entries.map((entry): ChapterExtractInput['known'][number] => ({
    name: entry.name,
    kind: entry.kind,
    aliases: entry.aliases,
    pending: true,
  }))
  const relations = await runAiTask(
    db,
    meta,
    chapterExtractRelationsTask,
    { ...input, known: [...input.known, ...newCards] },
    c,
  )
  return {
    output: mergeExtractionParts({
      facts: facts.output,
      threads: threads.output,
      relations: relations.output,
    }),
    runId: facts.runId,
    runIds: [facts.runId, threads.runId, relations.runId],
  }
}
