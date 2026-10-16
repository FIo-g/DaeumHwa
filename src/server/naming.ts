import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { namingRules } from '@/db/schema'
import type { Actor, NamingRuleRow } from '@/db/types'
import { AppError } from '@/lib/errors'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { assertEntryInWork, type ChangeOpts, logChange, preview } from '@/server/facts'

export type NamingRuleInput = {
  workId: string
  canonical: string
  variants: string[]
  note?: string
  entryId?: string | null
}

export type NamingRulePatch = Partial<Omit<NamingRuleInput, 'workId'>>

/** The correct spelling must not also be listed as a wrong one. Variants are trimmed and deduplicated. */
function normalizeSpelling(
  canonicalRaw: string,
  variantsRaw: string[],
): {
  canonical: string
  variants: string[]
} {
  const canonical = canonicalRaw.trim()
  if (!canonical) throw new AppError('VALIDATION', '올바른 표기를 입력하세요.')
  const variants = [...new Set(variantsRaw.map((v) => v.trim()).filter((v) => v !== ''))]
  if (variants.includes(canonical)) {
    throw new AppError('VALIDATION', '올바른 표기는 잘못된 표기 목록에 넣을 수 없습니다.')
  }
  return { canonical, variants }
}

async function loadRule(db: Db, ruleId: string): Promise<NamingRuleRow> {
  const [row] = await db.select().from(namingRules).where(eq(namingRules.id, ruleId)).limit(1)
  if (!row) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return row
}

export async function listNamingRules(
  db: Db,
  actor: Actor,
  workId: string,
  o: { includeArchived?: boolean } = {},
): Promise<NamingRuleRow[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  return db
    .select()
    .from(namingRules)
    .where(
      and(
        eq(namingRules.workId, workId),
        o.includeArchived ? undefined : isNull(namingRules.archivedAt),
      ),
    )
    .orderBy(asc(namingRules.canonical))
}

export async function createNamingRule(
  db: Db,
  actor: Actor,
  input: NamingRuleInput,
  o: ChangeOpts = {},
): Promise<NamingRuleRow> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  const { canonical, variants } = normalizeSpelling(input.canonical, input.variants)
  if (input.entryId) await assertEntryInWork(db, input.workId, input.entryId)

  return db.transaction(async (tx) => {
    const [rule] = await tx
      .insert(namingRules)
      .values({
        workId: input.workId,
        canonical,
        variants,
        note: (input.note ?? '').trim(),
        entryId: input.entryId ?? null,
      })
      .returning()
    await logChange(tx, actor, o, {
      workId: input.workId,
      targetTable: 'naming_rules',
      targetId: rule.id,
      action: 'create',
      before: null,
      after: rule,
      summary: `표기 규칙 추가: ${canonical}`,
    })
    return rule
  })
}

export async function updateNamingRule(
  db: Db,
  actor: Actor,
  ruleId: string,
  patch: NamingRulePatch,
  o: ChangeOpts = {},
): Promise<NamingRuleRow> {
  const workId = await requireRowWork(db, 'naming_rules', ruleId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const current = await loadRule(db, ruleId)
  if (current.archivedAt) throw new AppError('BAD_STATE', '보관된 표기 규칙은 수정할 수 없습니다.')

  const { canonical, variants } = normalizeSpelling(
    patch.canonical ?? current.canonical,
    patch.variants ?? current.variants,
  )
  const entryId = patch.entryId !== undefined ? patch.entryId : current.entryId
  if (entryId) await assertEntryInWork(db, workId, entryId)

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(namingRules)
      .set({
        canonical,
        variants,
        note: patch.note !== undefined ? patch.note.trim() : current.note,
        entryId,
        updatedAt: new Date(),
      })
      .where(eq(namingRules.id, ruleId))
      .returning()
    await logChange(tx, actor, o, {
      workId,
      targetTable: 'naming_rules',
      targetId: ruleId,
      action: 'update',
      before: current,
      after: row,
      summary: `표기 규칙 수정: ${canonical}`,
    })
    return row
  })
}

export async function archiveNamingRule(
  db: Db,
  actor: Actor,
  ruleId: string,
  o: ChangeOpts = {},
): Promise<NamingRuleRow> {
  const workId = await requireRowWork(db, 'naming_rules', ruleId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const current = await loadRule(db, ruleId)
  if (current.archivedAt) throw new AppError('BAD_STATE', '이미 보관된 표기 규칙입니다.')

  return db.transaction(async (tx) => {
    const now = new Date()
    const [row] = await tx
      .update(namingRules)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(namingRules.id, ruleId))
      .returning()
    await logChange(tx, actor, o, {
      workId,
      targetTable: 'naming_rules',
      targetId: ruleId,
      action: 'archive',
      before: current,
      after: row,
      summary: `표기 규칙 보관: ${preview(row.canonical)}`,
    })
    return row
  })
}
