'use server'

import { z } from 'zod'
import type { AuthorDirectiveRow, EntryRow, FactRow, NamingRuleRow, StyleCardRow } from '@/db/types'
import {
  CONTEXT_TIERS,
  DIRECTIVE_KINDS,
  DIRECTIVE_SCOPES,
  DIRECTIVE_SOURCES,
  DIRECTIVE_STATUSES,
  ENTRY_KINDS,
  FACT_SOURCE_TYPES,
  FACT_STATUSES,
  SPEECH_LEVELS,
} from '@/db/types'
import type { ActionResult } from '@/lib/result'
import { revalidateWork, withAction } from '@/server/action-helpers'
import {
  archiveDirective,
  createDirective,
  listDirectives,
  updateDirective,
} from '@/server/directives'
import { archiveFact, createFact, supersedeFact, updateFact } from '@/server/facts'
import { archiveNamingRule, createNamingRule, updateNamingRule } from '@/server/naming'
import { archiveStyleCard, createStyleCard, updateStyleCard } from '@/server/styles'
import { archiveEntry, createEntry, restoreEntry, updateEntry } from '@/server/wiki'

const EntryFields = z.object({
  kind: z.enum(ENTRY_KINDS),
  name: z.string().max(100),
  aliases: z.array(z.string().max(100)).max(30).optional(),
  summary: z.string().max(2000).optional(),
  body: z.string().max(50000).optional(),
  fields: z.record(z.string().max(50), z.string().max(500)).optional(),
  customFields: z
    .array(z.object({ key: z.string().max(50), value: z.string().max(500) }))
    .max(30)
    .optional(),
  contextTier: z.enum(CONTEXT_TIERS).optional(),
})

const CreateEntrySchema = EntryFields.extend({ workId: z.uuid() })
const UpdateEntrySchema = EntryFields.partial().extend({ entryId: z.uuid() })
const EntryIdSchema = z.object({ entryId: z.uuid() })

const FactFields = z.object({
  content: z.string().max(2000),
  status: z.enum(FACT_STATUSES),
  sourceType: z.enum(FACT_SOURCE_TYPES),
  entryId: z.uuid().nullable().optional(),
  subjectName: z.string().max(100).optional(),
  sourceChapterId: z.uuid().nullable().optional(),
  evidence: z.string().max(2000).optional(),
  validFromPosition: z.number().int().nullable().optional(),
  validToPosition: z.number().int().nullable().optional(),
  revealAtPosition: z.number().int().nullable().optional(),
})

const CreateFactSchema = FactFields.extend({ workId: z.uuid() })
const UpdateFactSchema = FactFields.partial().extend({ factId: z.uuid() })
const SupersedeFactSchema = z.object({
  factId: z.uuid(),
  fromPosition: z.number().int(),
  content: z.string().max(2000),
  status: z.enum(FACT_STATUSES),
  sourceType: z.enum(FACT_SOURCE_TYPES).optional(),
  evidence: z.string().max(2000).optional(),
  sourceChapterId: z.uuid().nullable().optional(),
})
const FactIdSchema = z.object({ factId: z.uuid() })

const NamingFields = z.object({
  canonical: z.string().max(100),
  variants: z.array(z.string().max(100)).max(30),
  note: z.string().max(500).optional(),
  entryId: z.uuid().nullable().optional(),
})

const CreateNamingRuleSchema = NamingFields.extend({ workId: z.uuid() })
const UpdateNamingRuleSchema = NamingFields.partial().extend({ ruleId: z.uuid() })
const RuleIdSchema = z.object({ ruleId: z.uuid() })

const StyleCardFields = z.object({
  name: z.string().max(100),
  entryId: z.uuid().nullable().optional(),
  tone: z.string().max(2000).optional(),
  rules: z.string().max(4000).optional(),
  examples: z.string().max(4000).optional(),
})

const CreateStyleCardSchema = StyleCardFields.extend({ workId: z.uuid() })
const UpdateStyleCardSchema = StyleCardFields.partial().extend({ cardId: z.uuid() })
const CardIdSchema = z.object({ cardId: z.uuid() })

const DirectiveFields = z.object({
  scope: z.enum(DIRECTIVE_SCOPES),
  kind: z.enum(DIRECTIVE_KINDS),
  // The service gives the Korean limit messages (300 for text, 100 for pattern); zod only bounds the input.
  text: z.string().max(5000),
  entryId: z.uuid().nullable().optional(),
  chapterPosition: z.number().int().nullable().optional(),
  pattern: z.string().max(300).nullable().optional(),
  speechLevel: z.enum(SPEECH_LEVELS).nullable().optional(),
  targetChars: z.number().int().nullable().optional(),
})

const CreateDirectiveSchema = DirectiveFields.extend({
  workId: z.uuid(),
  source: z.enum(DIRECTIVE_SOURCES),
})
const UpdateDirectiveSchema = DirectiveFields.partial().extend({
  directiveId: z.uuid(),
  status: z.enum(DIRECTIVE_STATUSES).optional(),
})
const DirectiveIdSchema = z.object({ directiveId: z.uuid() })

// ---- Entries ----

export async function createEntryAction(input: unknown): Promise<ActionResult<EntryRow>> {
  return withAction(async (db, actor) => {
    const { workId, ...data } = CreateEntrySchema.parse(input)
    const entry = await createEntry(db, actor, { workId, ...data })
    revalidateWork(entry.workId)
    return entry
  })
}

export async function updateEntryAction(input: unknown): Promise<ActionResult<EntryRow>> {
  return withAction(async (db, actor) => {
    const { entryId, ...patch } = UpdateEntrySchema.parse(input)
    const entry = await updateEntry(db, actor, entryId, patch)
    revalidateWork(entry.workId)
    return entry
  })
}

export async function archiveEntryAction(input: unknown): Promise<ActionResult<EntryRow>> {
  return withAction(async (db, actor) => {
    const { entryId } = EntryIdSchema.parse(input)
    const entry = await archiveEntry(db, actor, entryId)
    revalidateWork(entry.workId)
    return entry
  })
}

export async function restoreEntryAction(input: unknown): Promise<ActionResult<EntryRow>> {
  return withAction(async (db, actor) => {
    const { entryId } = EntryIdSchema.parse(input)
    const entry = await restoreEntry(db, actor, entryId)
    revalidateWork(entry.workId)
    return entry
  })
}

// ---- Facts ----

export async function createFactAction(input: unknown): Promise<ActionResult<FactRow>> {
  return withAction(async (db, actor) => {
    const { workId, ...data } = CreateFactSchema.parse(input)
    const fact = await createFact(db, actor, { workId, ...data })
    revalidateWork(fact.workId)
    return fact
  })
}

export async function updateFactAction(input: unknown): Promise<ActionResult<FactRow>> {
  return withAction(async (db, actor) => {
    const { factId, ...patch } = UpdateFactSchema.parse(input)
    const fact = await updateFact(db, actor, factId, patch)
    revalidateWork(fact.workId)
    return fact
  })
}

export async function archiveFactAction(input: unknown): Promise<ActionResult<FactRow>> {
  return withAction(async (db, actor) => {
    const { factId } = FactIdSchema.parse(input)
    const fact = await archiveFact(db, actor, factId)
    revalidateWork(fact.workId)
    return fact
  })
}

export async function supersedeFactAction(
  input: unknown,
): Promise<ActionResult<{ oldFact: FactRow; newFact: FactRow }>> {
  return withAction(async (db, actor) => {
    const data = SupersedeFactSchema.parse(input)
    const result = await supersedeFact(db, actor, data)
    revalidateWork(result.newFact.workId)
    return result
  })
}

// ---- Naming rules ----

export async function createNamingRuleAction(input: unknown): Promise<ActionResult<NamingRuleRow>> {
  return withAction(async (db, actor) => {
    const { workId, ...data } = CreateNamingRuleSchema.parse(input)
    const rule = await createNamingRule(db, actor, { workId, ...data })
    revalidateWork(rule.workId)
    return rule
  })
}

export async function updateNamingRuleAction(input: unknown): Promise<ActionResult<NamingRuleRow>> {
  return withAction(async (db, actor) => {
    const { ruleId, ...patch } = UpdateNamingRuleSchema.parse(input)
    const rule = await updateNamingRule(db, actor, ruleId, patch)
    revalidateWork(rule.workId)
    return rule
  })
}

export async function archiveNamingRuleAction(
  input: unknown,
): Promise<ActionResult<NamingRuleRow>> {
  return withAction(async (db, actor) => {
    const { ruleId } = RuleIdSchema.parse(input)
    const rule = await archiveNamingRule(db, actor, ruleId)
    revalidateWork(rule.workId)
    return rule
  })
}

// ---- Style cards ----

export async function createStyleCardAction(input: unknown): Promise<ActionResult<StyleCardRow>> {
  return withAction(async (db, actor) => {
    const { workId, ...data } = CreateStyleCardSchema.parse(input)
    const card = await createStyleCard(db, actor, { workId, ...data })
    revalidateWork(card.workId)
    return card
  })
}

export async function updateStyleCardAction(input: unknown): Promise<ActionResult<StyleCardRow>> {
  return withAction(async (db, actor) => {
    const { cardId, ...patch } = UpdateStyleCardSchema.parse(input)
    const card = await updateStyleCard(db, actor, cardId, patch)
    revalidateWork(card.workId)
    return card
  })
}

export async function archiveStyleCardAction(input: unknown): Promise<ActionResult<StyleCardRow>> {
  return withAction(async (db, actor) => {
    const { cardId } = CardIdSchema.parse(input)
    const card = await archiveStyleCard(db, actor, cardId)
    revalidateWork(card.workId)
    return card
  })
}

// ---- Author requests ----

export async function listDirectivesAction(
  input: unknown,
): Promise<ActionResult<(AuthorDirectiveRow & { entryName: string | null })[]>> {
  return withAction(async (db, actor) => {
    const { workId } = z.object({ workId: z.uuid() }).parse(input)
    return listDirectives(db, actor, workId)
  })
}

export async function createDirectiveAction(
  input: unknown,
): Promise<ActionResult<AuthorDirectiveRow>> {
  return withAction(async (db, actor) => {
    const data = CreateDirectiveSchema.parse(input)
    const row = await createDirective(db, actor, data)
    revalidateWork(row.workId)
    return row
  })
}

export async function updateDirectiveAction(
  input: unknown,
): Promise<ActionResult<AuthorDirectiveRow>> {
  return withAction(async (db, actor) => {
    const { directiveId, ...patch } = UpdateDirectiveSchema.parse(input)
    const row = await updateDirective(db, actor, directiveId, patch)
    revalidateWork(row.workId)
    return row
  })
}

export async function archiveDirectiveAction(
  input: unknown,
): Promise<ActionResult<AuthorDirectiveRow>> {
  return withAction(async (db, actor) => {
    const { directiveId } = DirectiveIdSchema.parse(input)
    const row = await archiveDirective(db, actor, directiveId)
    revalidateWork(row.workId)
    return row
  })
}
