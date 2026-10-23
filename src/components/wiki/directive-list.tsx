'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { SubmitButton } from '@/components/app/submit-button'
import { Badge } from '@/components/ui/badge'
import { buttonVariants, Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { DirectiveKind, DirectiveScope, DirectiveStatus, SpeechLevel } from '@/db/types'
import { banPatternFor } from '@/lib/directives'
import { DIRECTIVE_KIND_LABEL, DIRECTIVE_SCOPE_LABEL } from '@/lib/labels'
import { runAction } from '@/lib/client/run-action'
import {
  archiveDirectiveAction,
  createDirectiveAction,
  updateDirectiveAction,
} from '@/server/actions/wiki'
import { SelectField } from './select-field'

/** One author request as the ledger page passes it in. */
export type DirectiveItem = {
  id: string
  scope: DirectiveScope
  kind: DirectiveKind
  text: string
  status: DirectiveStatus
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

/** The author request ledger: active and switched-off requests, a form to add one, and the style cards they sit beside. */
export function DirectiveList({
  workId,
  directives,
  characters,
  styleCards,
  canEdit,
}: DirectiveListProps) {
  const active = directives.filter((d) => d.status === 'active')
  const off = directives.filter((d) => d.status === 'off')
  const speaking = characters.filter((c) => c.speech)

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="directives-active-heading" className="flex flex-col gap-3">
        <h2 id="directives-active-heading" className="text-base font-semibold">
          적용 중인 요청
        </h2>
        {active.length === 0 ? (
          <EmptyState title="아직 요청이 없습니다. AI가 계속 지켜야 할 것을 적어 두세요." />
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {active.map((directive) => (
              <DirectiveRow key={directive.id} directive={directive} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </section>

      {off.length > 0 && (
        <section aria-labelledby="directives-off-heading" className="flex flex-col gap-3">
          <h2 id="directives-off-heading" className="text-base font-semibold">
            꺼 둔 요청
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border">
            {off.map((directive) => (
              <DirectiveRow key={directive.id} directive={directive} canEdit={canEdit} />
            ))}
          </ul>
        </section>
      )}

      {canEdit && <DirectiveAddForm workId={workId} characters={characters} />}

      <section aria-labelledby="directives-styles-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="directives-styles-heading" className="text-base font-semibold">
            함께 적용되는 문체와 말투
          </h2>
          <Link
            href={`/works/${workId}/wiki?tab=styles`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            문체 카드 고치기
          </Link>
        </div>
        {styleCards.length === 0 && speaking.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 문체 카드나 말투가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {styleCards.map((card) => (
              <li key={`card-${card.name}`} className="whitespace-pre-line">
                {`${card.name}: ${card.rules}`}
              </li>
            ))}
            {speaking.map((character) => (
              <li key={`speech-${character.id}`} className="whitespace-pre-line">
                {`${character.name}: ${character.speech}`}
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

function DirectiveRow({ directive, canEdit }: { directive: DirectiveItem; canEdit: boolean }) {
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
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{scopeText(directive)}</Badge>
        <Badge variant="outline">{DIRECTIVE_KIND_LABEL[directive.kind]}</Badge>
      </div>
      <p className="whitespace-pre-line text-sm">{directive.text}</p>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={toggle}>
            {directive.status === 'active' ? '끄기' : '켜기'}
          </Button>
          <ConfirmButton
            title="이 요청을 보관할까요?"
            confirmLabel="보관"
            size="sm"
            onConfirm={async () => {
              const saved = await runAction(archiveDirectiveAction({ directiveId: directive.id }))
              if (saved) router.refresh()
            }}
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
      { success: '요청을 추가했습니다.' },
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border p-4">
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
      <div className="grid gap-4 sm:grid-cols-2">
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
