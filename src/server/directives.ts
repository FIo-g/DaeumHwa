import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { authorDirectives, wikiEntries } from '@/db/schema'
import type {
  Actor,
  AuthorDirectiveRow,
  DirectiveKind,
  DirectiveScope,
  DirectiveSource,
  DirectiveStatus,
  SpeechLevel,
} from '@/db/types'
import { type DirectiveForPrompt, banPatternFor } from '@/lib/directives'
import { AppError } from '@/lib/errors'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { type ChangeOpts, logChange, preview } from '@/server/facts'
import { recordUsageEvent } from '@/server/usage-events'

// Author request ledger (stage 2). Rows are written only by author actions; AI suggestions stay
// in the plan run's output until the author adds them. Rows are archived, never deleted.

const MAX_TEXT_CHARS = 300
const MIN_TARGET_CHARS = 500
const MAX_TARGET_CHARS = 20_000

export type DirectiveInput = {
  workId: string
  scope: DirectiveScope
  kind: DirectiveKind
  text: string
  entryId?: string | null
  chapterPosition?: number | null
  pattern?: string | null
  speechLevel?: SpeechLevel | null
  targetChars?: number | null
  source: DirectiveSource
}

export type DirectivePatch = Partial<Omit<DirectiveInput, 'workId' | 'source'>> & {
  status?: DirectiveStatus
}

/** The stored columns of a request after validation. */
type Checked = {
  text: string
  entryId: string | null
  chapterPosition: number | null
  pattern: string | null
  speechLevel: SpeechLevel | null
  targetChars: number | null
}

function isPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

/** Validates a request and returns the columns to store. Kind-only columns are null otherwise. */
async function checkDirective(db: Db, input: DirectiveInput): Promise<Checked> {
  const text = input.text.trim()
  if (!text) throw new AppError('VALIDATION', '요청 내용을 적어 주세요.')
  if (text.length > MAX_TEXT_CHARS) {
    throw new AppError('VALIDATION', '요청은 300자까지 적을 수 있습니다.')
  }

  let entryId: string | null = null
  let chapterPosition: number | null = null
  if (input.scope === 'character') {
    if (!input.entryId) throw new AppError('VALIDATION', '인물을 골라 주세요.')
    const [entry] = await db
      .select({ kind: wikiEntries.kind })
      .from(wikiEntries)
      .where(and(eq(wikiEntries.id, input.entryId), eq(wikiEntries.workId, input.workId)))
      .limit(1)
    if (!entry || entry.kind !== 'character') {
      throw new AppError('VALIDATION', '인물을 골라 주세요.')
    }
    entryId = input.entryId
  }
  if (input.scope === 'chapter') {
    if (!isPosition(input.chapterPosition)) {
      throw new AppError('VALIDATION', '몇 화에 적용할지 골라 주세요.')
    }
    chapterPosition = input.chapterPosition
  }

  const speechLevel = input.speechLevel ?? null
  if (speechLevel && input.scope !== 'character') {
    throw new AppError('VALIDATION', '말투는 인물 요청에만 정할 수 있습니다.')
  }

  let pattern: string | null = null
  if (input.kind === 'ban') {
    // An explicit empty pattern is an error; only a missing one takes the default from the text.
    pattern = input.pattern == null ? banPatternFor(text) : input.pattern.trim()
    if (!pattern) throw new AppError('VALIDATION', '쓰지 않을 말을 적어 주세요.')
  }

  let targetChars: number | null = null
  if (input.kind === 'length') {
    const chars = input.targetChars
    if (
      typeof chars !== 'number' ||
      !Number.isInteger(chars) ||
      chars < MIN_TARGET_CHARS ||
      chars > MAX_TARGET_CHARS
    ) {
      throw new AppError('VALIDATION', '분량은 500자에서 20,000자 사이로 적어 주세요.')
    }
    targetChars = chars
  }

  return { text, entryId, chapterPosition, pattern, speechLevel, targetChars }
}

async function loadDirective(db: Db, directiveId: string): Promise<AuthorDirectiveRow> {
  const [row] = await db
    .select()
    .from(authorDirectives)
    .where(eq(authorDirectives.id, directiveId))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return row
}

/** Active first, then off; each group by creation time. Viewer. */
export async function listDirectives(
  db: Db,
  actor: Actor,
  workId: string,
  o: { includeArchived?: boolean } = {},
): Promise<(AuthorDirectiveRow & { entryName: string | null })[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const rows = await db
    .select({ directive: authorDirectives, entryName: wikiEntries.name })
    .from(authorDirectives)
    .leftJoin(wikiEntries, eq(wikiEntries.id, authorDirectives.entryId))
    .where(
      and(
        eq(authorDirectives.workId, workId),
        o.includeArchived ? undefined : isNull(authorDirectives.archivedAt),
      ),
    )
    .orderBy(
      sql`case when ${authorDirectives.status} = 'active' then 0 else 1 end`,
      asc(authorDirectives.createdAt),
      asc(authorDirectives.id),
    )
  return rows.map((r) => ({ ...r.directive, entryName: r.entryName ?? null }))
}

/** Adds a request. Editor. A failed usage event never fails the save. */
export async function createDirective(
  db: Db,
  actor: Actor,
  input: DirectiveInput,
  o: ChangeOpts = {},
): Promise<AuthorDirectiveRow> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  const checked = await checkDirective(db, input)

  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(authorDirectives)
      .values({
        workId: input.workId,
        scope: input.scope,
        kind: input.kind,
        source: input.source,
        createdBy: actor.userId,
        ...checked,
      })
      .returning()
    await logChange(tx, actor, o, {
      workId: input.workId,
      targetTable: 'author_directives',
      targetId: created.id,
      action: 'create',
      before: null,
      after: created,
      summary: `작가 요청 추가: ${preview(created.text)}`,
    })
    return created
  })

  try {
    await recordUsageEvent(db, actor, {
      workId: input.workId,
      kind: 'directive_added',
      value: 1,
      extra: { [input.source]: 1 },
    })
  } catch (error) {
    console.warn('usage event directive_added failed', error)
  }
  return row
}

/** Edits a request, or turns it on and off with `status`. Editor. Archived requests are read-only. */
export async function updateDirective(
  db: Db,
  actor: Actor,
  directiveId: string,
  patch: DirectivePatch,
  o: ChangeOpts = {},
): Promise<AuthorDirectiveRow> {
  const workId = await requireRowWork(db, 'author_directives', directiveId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const current = await loadDirective(db, directiveId)
  if (current.archivedAt) throw new AppError('BAD_STATE', '보관된 요청은 수정할 수 없습니다.')

  const scope = patch.scope ?? current.scope
  // Leaving the character scope drops the speech level unless the patch sets one.
  const speechLevel =
    patch.speechLevel !== undefined
      ? patch.speechLevel
      : scope !== 'character'
        ? null
        : current.speechLevel
  const checked = await checkDirective(db, {
    workId,
    scope,
    kind: patch.kind ?? current.kind,
    text: patch.text ?? current.text,
    entryId: patch.entryId !== undefined ? patch.entryId : current.entryId,
    chapterPosition:
      patch.chapterPosition !== undefined ? patch.chapterPosition : current.chapterPosition,
    pattern: patch.pattern !== undefined ? patch.pattern : current.pattern,
    speechLevel,
    targetChars: patch.targetChars !== undefined ? patch.targetChars : current.targetChars,
    source: current.source,
  })
  const status = patch.status ?? current.status

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(authorDirectives)
      .set({
        scope,
        kind: patch.kind ?? current.kind,
        ...checked,
        status,
        updatedAt: new Date(),
      })
      .where(eq(authorDirectives.id, directiveId))
      .returning()
    const toggled = status !== current.status
    await logChange(tx, actor, o, {
      workId,
      targetTable: 'author_directives',
      targetId: directiveId,
      action: 'update',
      before: current,
      after: row,
      summary: toggled
        ? `작가 요청 ${status === 'off' ? '끔' : '켬'}: ${preview(row.text)}`
        : `작가 요청 수정: ${preview(row.text)}`,
    })
    return row
  })
}

/** Archives a request so it is never sent again. Editor. */
export async function archiveDirective(
  db: Db,
  actor: Actor,
  directiveId: string,
  o: ChangeOpts = {},
): Promise<AuthorDirectiveRow> {
  const workId = await requireRowWork(db, 'author_directives', directiveId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const current = await loadDirective(db, directiveId)
  if (current.archivedAt) throw new AppError('BAD_STATE', '이미 보관된 요청입니다.')

  return db.transaction(async (tx) => {
    const now = new Date()
    const [row] = await tx
      .update(authorDirectives)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(authorDirectives.id, directiveId))
      .returning()
    await logChange(tx, actor, o, {
      workId,
      targetTable: 'author_directives',
      targetId: directiveId,
      action: 'archive',
      before: current,
      after: row,
      summary: `작가 요청 보관: ${preview(row.text)}`,
    })
    return row
  })
}

/**
 * The requests that apply to one chapter: work-wide ones, character ones whose entry is in
 * `entryIds` and not archived, and chapter ones for `position`. Active and not archived only.
 * No actor: callers have already checked the work.
 */
export async function activeDirectivesFor(
  db: Db,
  workId: string,
  o: { position: number; entryIds: string[] },
): Promise<DirectiveForPrompt[]> {
  const rows = await db
    .select({
      directive: authorDirectives,
      entryName: wikiEntries.name,
      entryArchivedAt: wikiEntries.archivedAt,
    })
    .from(authorDirectives)
    .leftJoin(wikiEntries, eq(wikiEntries.id, authorDirectives.entryId))
    .where(
      and(
        eq(authorDirectives.workId, workId),
        eq(authorDirectives.status, 'active'),
        isNull(authorDirectives.archivedAt),
      ),
    )
    .orderBy(asc(authorDirectives.createdAt), asc(authorDirectives.id))

  const entryIds = new Set(o.entryIds)
  const out: DirectiveForPrompt[] = []
  for (const { directive: d, entryName, entryArchivedAt } of rows) {
    const applies =
      d.scope === 'work' ||
      (d.scope === 'chapter' && d.chapterPosition === o.position) ||
      (d.scope === 'character' && d.entryId !== null && entryIds.has(d.entryId) && !entryArchivedAt)
    if (!applies) continue
    out.push({
      id: d.id,
      scope: d.scope,
      kind: d.kind,
      text: d.text,
      pattern: d.pattern,
      speechLevel: d.speechLevel,
      targetChars: d.targetChars,
      chapterPosition: d.chapterPosition,
      entryId: d.entryId,
      entryName: entryName ?? null,
    })
  }
  return out
}
