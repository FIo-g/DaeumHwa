'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useRef, useState } from 'react'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { SubmitButton } from '@/components/app/submit-button'
import { GridTitle } from '@/components/motion'
import { buttonVariants, Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type {
  DirectiveKind,
  DirectiveScope,
  DirectiveSource,
  DirectiveStatus,
  SpeechLevel,
} from '@/db/types'
import type { InferredProposal } from '@/server/directive-infer'
import { banPatternFor } from '@/lib/directives'
import {
  DIRECTIVE_KIND_LABEL,
  DIRECTIVE_SCOPE_LABEL,
  DIRECTIVE_SOURCE_LABEL,
  DIRECTIVE_STATUS_LABEL,
} from '@/lib/labels'
import { runAction } from '@/lib/client/run-action'
import {
  archiveDirectiveAction,
  createDirectiveAction,
  decideInferredAction,
  updateDirectiveAction,
} from '@/server/actions/wiki'
import { useWikiTabArchive } from './naming-rules'
import { SelectField } from './select-field'

/** One author request as the ledger page passes it in. */
export type DirectiveItem = {
  id: string
  scope: DirectiveScope
  kind: DirectiveKind
  text: string
  status: DirectiveStatus
  source?: DirectiveSource
  entryId: string | null
  entryName: string | null
  chapterPosition: number | null
  pattern: string | null
  speechLevel: SpeechLevel | null
  targetChars: number | null
}

type CharacterItem = { id: string; name: string; speech: string | null }
type StyleCardSummary = { name: string; rules: string }

type DirectiveListProps = {
  workId: string
  directives: DirectiveItem[]
  characters: CharacterItem[]
  styleCards: StyleCardSummary[]
  canEdit: boolean
  inferred?: InferredProposal[]
}

const SCOPE_OPTIONS: { value: DirectiveScope; label: string }[] = [
  { value: 'work', label: '작품 전체' },
  { value: 'character', label: '인물' },
  { value: 'chapter', label: '한 회차만' },
]

const KIND_OPTIONS: { value: DirectiveKind; label: string }[] = [
  { value: 'style', label: '문체' },
  { value: 'speech', label: '말투' },
  { value: 'ban', label: '쓰지 않을 말' },
  { value: 'length', label: '분량' },
  { value: 'content', label: '내용' },
]

type SpeechOption = 'none' | SpeechLevel

const SPEECH_OPTIONS: { value: SpeechOption; label: string }[] = [
  { value: 'none', label: '정하지 않음' },
  { value: 'banmal', label: '반말' },
  { value: 'jondaet', label: '존댓말' },
]

const NONE = '__none__'

function inferredKey({ runId, index }: InferredProposal) {
  return `${runId}-${index}`
}

/** The author request ledger: active and switched-off requests, a form to add one, and the style cards they sit beside. */
export function DirectiveList({
  workId,
  directives,
  characters,
  styleCards,
  canEdit,
  inferred = [],
}: DirectiveListProps) {
  const router = useRouter()
  const [decisions, setDecisions] = useState<Record<string, DirectiveItem | null>>({})
  const remaining = inferred.filter((proposal) => !(inferredKey(proposal) in decisions))
  const added = inferred.flatMap((proposal) => {
    const row = decisions[inferredKey(proposal)]
    return row && !directives.some(({ id }) => id === row.id) ? [row] : []
  })
  const { rows, archive } = useWikiTabArchive([...directives, ...added])
  const active = rows.filter((d) => d.status === 'active')
  const off = rows.filter((d) => d.status === 'off')
  const speaking = characters.filter((c) => c.speech)

  async function handleDecide(proposal: InferredProposal, decision: 'add' | 'ignore') {
    const saved = await runAction(
      decideInferredAction({
        workId,
        runId: proposal.runId,
        index: proposal.index,
        decision,
      }),
    )
    if (!saved) return
    const row: DirectiveItem | null = saved.directiveId
      ? {
          id: saved.directiveId,
          scope: proposal.entryId ? 'character' : 'work',
          kind: proposal.kind,
          text: proposal.text,
          status: 'active',
          source: 'inferred',
          entryId: proposal.entryId,
          entryName: proposal.entryName,
          chapterPosition: null,
          pattern: proposal.pattern,
          speechLevel: null,
          targetChars: null,
        }
      : null
    setDecisions((current) => ({ ...current, [inferredKey(proposal)]: row }))
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-5">
      {remaining.length > 0 && (
        <section aria-labelledby="directives-inferred-heading" className="flex flex-col gap-3">
          <GridTitle id="directives-inferred-heading">수정에서 찾은 요청</GridTitle>
          <p className="b-label b-muted">
            작가님이 초안을 고친 곳에서 찾아낸 요청이에요. 추가해야 적용돼요.
          </p>
          <ul className="wg-wiki-tabs-list">
            {remaining.map((proposal, index) => (
              <InferredRow
                key={inferredKey(proposal)}
                proposal={proposal}
                rowIndex={index}
                canEdit={canEdit}
                onDecide={(decision) => handleDecide(proposal, decision)}
              />
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="directives-active-heading" className="flex flex-col gap-3">
        <GridTitle id="directives-active-heading">적용 중인 요청</GridTitle>
        {active.length === 0 ? (
          <EmptyState title="아직 요청이 없어요. AI가 매번 지켜야 할 걸 적어 두세요." />
        ) : (
          <ul className="wg-wiki-tabs-list">
            {active.map((directive, index) => (
              <DirectiveRow
                key={directive.id}
                directive={directive}
                canEdit={canEdit}
                rowIndex={index}
                archive={(row) =>
                  archive(directive, row, () =>
                    runAction(archiveDirectiveAction({ directiveId: directive.id })),
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>

      {off.length > 0 && (
        <section aria-labelledby="directives-off-heading" className="flex flex-col gap-3">
          <h2 id="directives-off-heading" className="b-subhead">
            꺼 둔 요청
          </h2>
          <ul className="wg-wiki-tabs-list">
            {off.map((directive, index) => (
              <DirectiveRow
                key={directive.id}
                directive={directive}
                canEdit={canEdit}
                rowIndex={index}
                archive={(row) =>
                  archive(directive, row, () =>
                    runAction(archiveDirectiveAction({ directiveId: directive.id })),
                  )
                }
              />
            ))}
          </ul>
        </section>
      )}

      {canEdit && <DirectiveAddForm workId={workId} characters={characters} />}

      <section aria-labelledby="directives-styles-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="directives-styles-heading" className="b-subhead">
            함께 적용되는 문체와 말투
          </h2>
          <Link
            href={`/works/${workId}/wiki?tab=styles`}
            className={buttonVariants({ variant: 'link', size: 'sm' })}
          >
            문체 카드 고치기
          </Link>
        </div>
        {styleCards.length === 0 && speaking.length === 0 ? (
          <p className="b-label b-muted">아직 문체 카드나 말투가 없어요.</p>
        ) : (
          <ul className="wg-wiki-tabs-list">
            {[
              ...styleCards.map((card, index) => ({
                key: `card-${index}`,
                copy: `${card.name}: ${card.rules}`,
              })),
              ...speaking.map((character) => ({
                key: `speech-${character.id}`,
                copy: `${character.name}: ${character.speech}`,
              })),
            ].map(({ key, copy }, index) => (
              <li
                key={key}
                className="wg-wiki-tabs-row wg-wiki-tabs-entry"
                style={{ '--wg-wiki-tabs-order': Math.min(index, 2) } as CSSProperties}
                tabIndex={0}
              >
                <span className="wg-wiki-tabs-number" aria-hidden="true" />
                <p className="whitespace-pre-line text-sm wg-wiki-tabs-write">{copy}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function scopeText(directive: DirectiveItem): string {
  if (directive.scope === 'character') return `인물 ${directive.entryName ?? '-'}`
  if (directive.scope === 'chapter') return `${directive.chapterPosition ?? '-'}화만`
  return DIRECTIVE_SCOPE_LABEL.work
}

function inferredScopeText(proposal: InferredProposal): string {
  if (proposal.entryId || proposal.entryName) return `인물 ${proposal.entryName ?? '-'}`
  return DIRECTIVE_SCOPE_LABEL.work
}

function DirectiveCells({ scope, kind }: { scope: string; kind: DirectiveKind }) {
  return (
    <div className="wg-wiki-tabs-directive-cells wg-wiki-tabs-write">
      <span>{scope}</span>
      <span>{DIRECTIVE_KIND_LABEL[kind]}</span>
    </div>
  )
}

function InferredRow({
  proposal,
  rowIndex,
  canEdit,
  onDecide,
}: {
  proposal: InferredProposal
  rowIndex: number
  canEdit: boolean
  onDecide: (decision: 'add' | 'ignore') => Promise<void>
}) {
  const [pending, setPending] = useState(false)

  async function decide(decision: 'add' | 'ignore') {
    setPending(true)
    try {
      await onDecide(decision)
    } finally {
      setPending(false)
    }
  }

  return (
    <li
      className="wg-wiki-tabs-row wg-wiki-tabs-directive"
      style={{ '--wg-wiki-tabs-order': Math.min(rowIndex, 2) } as CSSProperties}
      tabIndex={0}
    >
      <span className="wg-wiki-tabs-number" aria-hidden="true" />
      <DirectiveCells scope={inferredScopeText(proposal)} kind={proposal.kind} />
      <p className="wg-wiki-tabs-request-copy wg-wiki-tabs-write">{proposal.text}</p>
      <span className="wg-wiki-tabs-directive-meta wg-wiki-tabs-write">
        {DIRECTIVE_SOURCE_LABEL.inferred}
      </span>
      {canEdit && (
        <div className="wg-wiki-tabs-actions">
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={pending}
            onClick={() => void decide('add')}
          >
            추가
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={pending}
            onClick={() => void decide('ignore')}
          >
            무시
          </Button>
        </div>
      )}
    </li>
  )
}

function DirectiveRow({
  directive,
  canEdit,
  rowIndex,
  archive,
}: {
  directive: DirectiveItem
  canEdit: boolean
  rowIndex: number
  archive: (row: HTMLLIElement | null) => Promise<void>
}) {
  const row = useRef<HTMLLIElement>(null)
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const nextStatus: DirectiveStatus = directive.status === 'active' ? 'off' : 'active'

  async function toggle() {
    setPending(true)
    const saved = await runAction(
      updateDirectiveAction({ directiveId: directive.id, status: nextStatus }),
    )
    setPending(false)
    if (saved) router.refresh()
  }

  return (
    <li
      ref={row}
      className="wg-wiki-tabs-row wg-wiki-tabs-directive"
      data-status={directive.status}
      style={{ '--wg-wiki-tabs-order': Math.min(rowIndex, 2) } as CSSProperties}
      tabIndex={0}
    >
      <span className="wg-wiki-tabs-number" aria-hidden="true" />
      <DirectiveCells scope={scopeText(directive)} kind={directive.kind} />
      <p className="wg-wiki-tabs-request-copy wg-wiki-tabs-write">{directive.text}</p>
      <div className="wg-wiki-tabs-directive-meta wg-wiki-tabs-write">
        <span className="wg-wiki-tabs-status">
          <span aria-hidden="true">{directive.status === 'active' ? '●' : '◎'}</span>
          {DIRECTIVE_STATUS_LABEL[directive.status]}
        </span>
        {directive.source && <span>{DIRECTIVE_SOURCE_LABEL[directive.source]}</span>}
      </div>
      {canEdit && (
        <div className="wg-wiki-tabs-actions">
          <Button type="button" variant="link" size="sm" disabled={pending} onClick={toggle}>
            {directive.status === 'active' ? '끄기' : '켜기'}
          </Button>
          <ConfirmButton
            title="이 요청을 보관할까요?"
            confirmLabel="보관"
            variant="link"
            size="sm"
            onConfirm={() => archive(row.current)}
          >
            보관
          </ConfirmButton>
        </div>
      )}
    </li>
  )
}

function DirectiveAddForm({ workId, characters }: { workId: string; characters: CharacterItem[] }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [scope, setScope] = useState<DirectiveScope>('work')
  const [entryId, setEntryId] = useState(NONE)
  const [chapter, setChapter] = useState('')
  const [kind, setKind] = useState<DirectiveKind>('style')
  // null means "follow the text"; the author's edit takes over once typed.
  const [patternDraft, setPatternDraft] = useState<string | null>(null)
  const [speech, setSpeech] = useState<SpeechOption>('none')
  const [targetChars, setTargetChars] = useState('')
  const [pending, setPending] = useState(false)

  const pattern = patternDraft ?? banPatternFor(text)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const saved = await runAction(
      createDirectiveAction({
        workId,
        scope,
        kind,
        text: text.trim(),
        entryId: scope === 'character' && entryId !== NONE ? entryId : null,
        chapterPosition: scope === 'chapter' && chapter.trim() !== '' ? Number(chapter) : null,
        pattern: kind === 'ban' ? pattern.trim() : null,
        speechLevel: kind === 'speech' && speech !== 'none' ? speech : null,
        targetChars: kind === 'length' && targetChars.trim() !== '' ? Number(targetChars) : null,
        source: 'author',
      }),
      { success: '요청을 추가했어요.' },
    )
    setPending(false)
    if (saved) {
      setText('')
      setPatternDraft(null)
      setTargetChars('')
      router.refresh()
    }
  }

  return (
    <form onSubmit={onSubmit} className="wg-wiki-tabs-request-form flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="directive-text">요청 내용</Label>
        <Textarea
          id="directive-text"
          required
          maxLength={300}
          rows={2}
          placeholder="예: 세린은 누구에게나 반말을 한다."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="wg-wiki-tabs-request-fields">
        <SelectField
          id="directive-scope"
          label="범위"
          value={scope}
          options={SCOPE_OPTIONS}
          onChange={setScope}
        />
        {scope === 'character' && (
          <SelectField
            id="directive-character"
            label="인물"
            value={entryId}
            options={[
              { value: NONE, label: '인물을 고르세요' },
              ...characters.map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={setEntryId}
          />
        )}
        {scope === 'chapter' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="directive-chapter">회차</Label>
            <Input
              id="directive-chapter"
              type="number"
              min={1}
              step={1}
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
            />
          </div>
        )}
        <SelectField
          id="directive-kind"
          label="종류"
          value={kind}
          options={KIND_OPTIONS}
          onChange={setKind}
        />
        {kind === 'ban' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="directive-pattern">찾을 말</Label>
            <Input
              id="directive-pattern"
              maxLength={100}
              value={pattern}
              onChange={(e) => setPatternDraft(e.target.value)}
            />
          </div>
        )}
        {kind === 'speech' && (
          <SelectField
            id="directive-speech"
            label="말투"
            value={speech}
            options={SPEECH_OPTIONS}
            onChange={setSpeech}
          />
        )}
        {kind === 'length' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="directive-length">공백 포함 글자 수</Label>
            <Input
              id="directive-length"
              type="number"
              min={500}
              max={20000}
              step={1}
              value={targetChars}
              onChange={(e) => setTargetChars(e.target.value)}
            />
          </div>
        )}
      </div>
      <div>
        <SubmitButton pending={pending}>요청 추가</SubmitButton>
      </div>
    </form>
  )
}
