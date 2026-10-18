import { readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { IMPORTANCE } from '@/db/types'

// Story bible fixtures for the novel eval. Each language has its own bible.json under
// eval/fixtures/novel/<lang>. Keep both files in parity; the bible test enforces it.

const keyed = {
  key: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  summary: z.string(),
}

export const BibleSchema = z.object({
  lang: z.enum(['ko', 'en']),
  work: z.object({
    title: z.string(),
    genre: z.string(),
    logline: z.string(),
    synopsis: z.string(),
  }),
  targetChars: z.number().int(),
  characters: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      aliases: z.array(z.string()),
      role: z.string(),
      voice: z.string(),
      main: z.boolean(),
      summary: z.string(),
    }),
  ),
  places: z.array(z.object(keyed)),
  items: z.array(z.object(keyed)),
  facts: z.array(
    z.object({
      key: z.string(),
      subject: z.string(),
      content: z.string(),
      validFrom: z.number().int().nullable(),
      validTo: z.number().int().nullable(),
    }),
  ),
  threads: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      description: z.string(),
      plannedChapter: z.number().int().nullable(),
      targetChapter: z.number().int().nullable(),
      importance: z.enum(IMPORTANCE),
    }),
  ),
  namingRules: z.array(
    z.object({ canonical: z.string(), variants: z.array(z.string()), note: z.string() }),
  ),
  workStyle: z.object({
    name: z.string(),
    tone: z.string(),
    rules: z.string(),
    examples: z.string(),
  }),
  answerBank: z.array(
    z.object({ key: z.string(), topics: z.array(z.string()), answer: z.string() }),
  ),
  chapters: z.array(
    z.object({
      position: z.number().int(),
      title: z.string(),
      instructions: z.string(),
      mustInclude: z.array(z.string()),
      summary: z.string(),
    }),
  ),
})

export type Bible = z.infer<typeof BibleSchema>

// Resolved from the working directory, like eval/run-continuity.ts does.
export function bibleDir(lang: 'ko' | 'en'): string {
  return path.resolve(process.cwd(), 'eval/fixtures/novel', lang)
}

export function loadBible(lang: 'ko' | 'en'): Bible {
  const raw = readFileSync(path.join(bibleDir(lang), 'bible.json'), 'utf8')
  return BibleSchema.parse(JSON.parse(raw))
}
