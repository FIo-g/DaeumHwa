'use client'

import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useRef, useState } from 'react'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { SubmitButton } from '@/components/app/submit-button'
import { GridTitle, Sheet } from '@/components/motion'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ProposalRow } from '@/db/types'
import { postAction } from '@/lib/client/post-json'
import { runAction } from '@/lib/client/run-action'
import { useAiRun } from '@/lib/client/use-ai-run'
import {
  archiveStyleCardAction,
  createStyleCardAction,
  updateStyleCardAction,
} from '@/server/actions/wiki'
import { useWikiTabArchive } from './naming-rules'
import { SelectField } from './select-field'

export type StyleCardItem = {
  id: string
  name: string
  entryId: string | null
  entryName: string | null
  tone: string
  rules: string
  examples: string
}

type StyleCardsProps = {
  workId: string
  cards: StyleCardItem[]
  characters: { id: string; name: string }[]
  canEdit: boolean
  canSuggest?: boolean
}

const NONE = '__none__'

/** Style cards (말투, 규칙, 예시) and the AI suggestion entry point for each character. */
export function StyleCards({
  workId,
  cards,
  characters,
  canEdit,
  canSuggest = canEdit,
}: StyleCardsProps) {
  const { rows, archive } = useWikiTabArchive(cards)

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="style-cards-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <GridTitle id="style-cards-heading" className="wg-wiki-tabs-title">
            문체 카드
          </GridTitle>
          {canEdit && (
            <StyleCardDialog
              workId={workId}
              characters={characters}
              triggerLabel="문체 카드 추가"
            />
          )}
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title="아직 문체 카드가 없어요."
            description="인물 말투와 예시 대사를 적어 두세요. AI 초안이 그 말투를 따라 써요."
          />
        ) : (
          <div className="wg-wiki-tabs-list wg-wiki-tabs-sheets">
            {rows.map((card, index) => (
              <StyleCardView
                key={card.id}
                workId={workId}
                card={card}
                index={index}
                characters={characters}
                canEdit={canEdit}
                archive={(row) =>
                  archive(card, row, () =>
                    runAction(archiveStyleCardAction({ cardId: card.id }), {
                      success: '문체 카드를 보관했어요.',
                    }),
                  )
                }
              />
            ))}
          </div>
        )}
      </section>
      {canSuggest && (
        <section aria-labelledby="style-suggest-heading" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="style-suggest-heading" className="b-subhead">
              AI로 문체 카드 제안
            </h2>
            <p className="b-label b-muted">
              원고에서 인물 대사를 모아 문체 카드 초안을 만들어 승인 대기에 올려요.
            </p>
          </div>
          {characters.length === 0 ? (
            <EmptyState title="아직 인물이 없어요." />
          ) : (
            <ul className="wg-wiki-tabs-list">
              {characters.map((character, index) => (
                <li
                  key={character.id}
                  style={{ '--wg-wiki-tabs-order': Math.min(index, 2) } as CSSProperties}
                  className="wg-wiki-tabs-row wg-wiki-tabs-entry"
                  tabIndex={0}
                >
                  <span className="wg-wiki-tabs-number" aria-hidden="true" />
                  <span className="font-heading font-bold wg-wiki-tabs-write">
                    {character.name}
                  </span>
                  <SuggestButton workId={workId} entryId={character.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function SuggestButton({ workId, entryId }: { workId: string; entryId: string }) {
  const ai = useAiRun()

  // A route handler, not a Server Action: the suggestion can run for minutes.
  function suggest() {
    void ai.run((signal) =>
      runAction(
        postAction<ProposalRow>(`/api/works/${workId}/style-suggest`, { entryId }, { signal }),
        { success: '문체 카드 제안을 승인 대기에 올렸어요.' },
      ),
    )
  }

  if (ai.running) {
    return (
      <AiRunStatus label="문체 제안 만드는 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
    )
  }
  return (
    <Button type="button" variant="link" size="sm" onClick={suggest}>
      AI로 문체 카드 제안
    </Button>
  )
}

function StyleCardView({
  workId,
  card,
  index,
  characters,
  canEdit,
  archive,
}: {
  workId: string
  card: StyleCardItem
  index: number
  characters: { id: string; name: string }[]
  canEdit: boolean
  archive: (row: HTMLDivElement | null) => Promise<void>
}) {
  const row = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={row}
      className="wg-wiki-tabs-row"
      tabIndex={0}
      style={{ '--wg-wiki-tabs-order': Math.min(index, 2) } as CSSProperties}
    >
      <span className="wg-wiki-tabs-number" aria-hidden="true" />
      <Sheet as="article" page={String(index + 1).padStart(2, '0')}>
        <div className="wg-wiki-tabs-entry">
          <div
            key={JSON.stringify([card.name, card.entryName])}
            className="wg-wiki-tabs-write min-w-0"
          >
            <h3 className="font-heading text-lg font-bold">{card.name}</h3>
            <p className="b-label b-muted">
              연결 인물 <span className="text-ink">{card.entryName ?? '없음'}</span>
            </p>
          </div>
          {canEdit && (
            <div className="wg-wiki-tabs-actions">
              <StyleCardDialog
                workId={workId}
                characters={characters}
                card={card}
                triggerLabel="수정"
              />
              <ConfirmButton
                title="이 문체 카드를 보관할까요?"
                confirmLabel="보관"
                variant="link"
                size="sm"
                onConfirm={() => archive(row.current)}
              >
                보관
              </ConfirmButton>
            </div>
          )}
        </div>
        <dl
          key={JSON.stringify([card.tone, card.rules, card.examples])}
          className="wg-wiki-tabs-style-fields wg-wiki-tabs-write"
        >
          <div>
            <dt className="b-label b-muted">말투</dt>
            <dd className="whitespace-pre-wrap">{card.tone || '-'}</dd>
          </div>
          <div>
            <dt className="b-label b-muted">규칙</dt>
            <dd>
              <ul className="wg-wiki-tabs-style-rules">
                {(card.rules || '-').split(/\r?\n/).map((rule, index) => (
                  <li key={index}>{rule}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="b-label b-muted">예시</dt>
            <dd>
              {card.examples ? (
                <blockquote className="wg-wiki-tabs-example">
                  <span aria-hidden="true">「</span>
                  <span>{card.examples}</span>
                  <span aria-hidden="true">」</span>
                </blockquote>
              ) : (
                '-'
              )}
            </dd>
          </div>
        </dl>
      </Sheet>
    </div>
  )
}

function StyleCardDialog({
  workId,
  characters,
  card,
  triggerLabel,
}: {
  workId: string
  characters: { id: string; name: string }[]
  card?: StyleCardItem
  triggerLabel: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={card ? 'link' : 'default'} size="sm" />}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{card ? '문체 카드 수정' : '문체 카드 추가'}</DialogTitle>
        </DialogHeader>
        <StyleCardFields
          workId={workId}
          characters={characters}
          card={card}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function StyleCardFields({
  workId,
  characters,
  card,
  onDone,
}: {
  workId: string
  characters: { id: string; name: string }[]
  card?: StyleCardItem
  onDone: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(card?.name ?? '')
  const [entryId, setEntryId] = useState(card?.entryId ?? NONE)
  const [tone, setTone] = useState(card?.tone ?? '')
  const [rules, setRules] = useState(card?.rules ?? '')
  const [examples, setExamples] = useState(card?.examples ?? '')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = {
      name: name.trim(),
      entryId: entryId === NONE ? null : entryId,
      tone,
      rules,
      examples,
    }
    setPending(true)
    const saved = card
      ? await runAction(updateStyleCardAction({ cardId: card.id, ...fields }), {
          success: '문체 카드를 저장했어요.',
        })
      : await runAction(createStyleCardAction({ workId, ...fields }), {
          success: '문체 카드를 추가했어요.',
        })
    setPending(false)
    if (saved) {
      onDone()
      router.refresh()
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="style-name">카드 이름</Label>
        <Input
          id="style-name"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <SelectField
        id="style-entry"
        label="연결 인물"
        value={entryId}
        options={[
          { value: NONE, label: '없음' },
          ...characters.map((c) => ({ value: c.id, label: c.name })),
        ]}
        onChange={setEntryId}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="style-tone">말투</Label>
        <Textarea
          id="style-tone"
          rows={2}
          maxLength={2000}
          value={tone}
          onChange={(e) => setTone(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="style-rules">규칙</Label>
        <Textarea
          id="style-rules"
          rows={3}
          maxLength={4000}
          value={rules}
          onChange={(e) => setRules(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="style-examples">예시</Label>
        <Textarea
          id="style-examples"
          rows={3}
          maxLength={4000}
          value={examples}
          onChange={(e) => setExamples(e.target.value)}
        />
      </div>
      <DialogFooter>
        <SubmitButton pending={pending}>저장</SubmitButton>
      </DialogFooter>
    </form>
  )
}
