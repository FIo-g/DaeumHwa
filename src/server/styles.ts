import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { styleCards, wikiEntries } from '@/db/schema'
import type { Actor, StyleCardRow } from '@/db/types'
import { AppError } from '@/lib/errors'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { assertEntryInWork, type ChangeOpts, logChange, preview } from '@/server/facts'

export type StyleCardInput = {
  workId: string
  entryId?: string | null
  name: string
  tone?: string
  rules?: string
  examples?: string
}

export type StyleCardPatch = Partial<Omit<StyleCardInput, 'workId'>>

function normalizeName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new AppError('VALIDATION', '문체 카드 이름을 입력하세요.')
  return trimmed
}

async function loadCard(db: Db, cardId: string): Promise<StyleCardRow> {
  const [row] = await db.select().from(styleCards).where(eq(styleCards.id, cardId)).limit(1)
  if (!row) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return row
}

export async function listStyleCards(
  db: Db,
  actor: Actor,
  workId: string,
  o: { includeArchived?: boolean } = {},
): Promise<(StyleCardRow & { entryName: string | null })[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const rows = await db
    .select({ card: styleCards, entryName: wikiEntries.name })
    .from(styleCards)
    .leftJoin(wikiEntries, eq(wikiEntries.id, styleCards.entryId))
    .where(
      and(
        eq(styleCards.workId, workId),
        o.includeArchived ? undefined : isNull(styleCards.archivedAt),
      ),
    )
    .orderBy(asc(styleCards.name))
  return rows.map((r) => ({ ...r.card, entryName: r.entryName ?? null }))
}

export async function createStyleCard(
  db: Db,
  actor: Actor,
  input: StyleCardInput,
  o: ChangeOpts = {},
): Promise<StyleCardRow> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  const name = normalizeName(input.name)
  if (input.entryId) await assertEntryInWork(db, input.workId, input.entryId)

  return db.transaction(async (tx) => {
    const [card] = await tx
      .insert(styleCards)
      .values({
        workId: input.workId,
        entryId: input.entryId ?? null,
        name,
        tone: (input.tone ?? '').trim(),
        rules: (input.rules ?? '').trim(),
        examples: (input.examples ?? '').trim(),
        createdByType: o.proposerType ?? 'author',
      })
      .returning()
    await logChange(tx, actor, o, {
      workId: input.workId,
      targetTable: 'style_cards',
      targetId: card.id,
      action: 'create',
      before: null,
      after: card,
      summary: `문체 카드 추가: ${name}`,
    })
    return card
  })
}

export async function updateStyleCard(
  db: Db,
  actor: Actor,
  cardId: string,
  patch: StyleCardPatch,
  o: ChangeOpts = {},
): Promise<StyleCardRow> {
  const workId = await requireRowWork(db, 'style_cards', cardId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const current = await loadCard(db, cardId)
  if (current.archivedAt) throw new AppError('BAD_STATE', '보관된 문체 카드는 수정할 수 없습니다.')

  const name = patch.name !== undefined ? normalizeName(patch.name) : current.name
  const entryId = patch.entryId !== undefined ? patch.entryId : current.entryId
  if (entryId) await assertEntryInWork(db, workId, entryId)

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(styleCards)
      .set({
        name,
        entryId,
        tone: patch.tone !== undefined ? patch.tone.trim() : current.tone,
        rules: patch.rules !== undefined ? patch.rules.trim() : current.rules,
        examples: patch.examples !== undefined ? patch.examples.trim() : current.examples,
        updatedAt: new Date(),
      })
      .where(eq(styleCards.id, cardId))
      .returning()
    await logChange(tx, actor, o, {
      workId,
      targetTable: 'style_cards',
      targetId: cardId,
      action: 'update',
      before: current,
      after: row,
      summary: `문체 카드 수정: ${name}`,
    })
    return row
  })
}

export async function archiveStyleCard(
  db: Db,
  actor: Actor,
  cardId: string,
  o: ChangeOpts = {},
): Promise<StyleCardRow> {
  const workId = await requireRowWork(db, 'style_cards', cardId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const current = await loadCard(db, cardId)
  if (current.archivedAt) throw new AppError('BAD_STATE', '이미 보관된 문체 카드입니다.')

  return db.transaction(async (tx) => {
    const now = new Date()
    const [row] = await tx
      .update(styleCards)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(styleCards.id, cardId))
      .returning()
    await logChange(tx, actor, o, {
      workId,
      targetTable: 'style_cards',
      targetId: cardId,
      action: 'archive',
      before: current,
      after: row,
      summary: `문체 카드 보관: ${preview(row.name)}`,
    })
    return row
  })
}
