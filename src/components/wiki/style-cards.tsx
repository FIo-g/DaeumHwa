'use client'

import { SparklesIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { SubmitButton } from '@/components/app/submit-button'
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
}

const NONE = '__none__'

/** Style cards (말투, 규칙, 예시) and the AI suggestion entry point for each character. */
export function StyleCards({ workId, cards, characters, canEdit }: StyleCardsProps) {
  return (
    <div className="flex flex-col gap-8">
      {canEdit && (
        <section aria-labelledby="style-suggest-heading" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="style-suggest-heading" className="text-base font-semibold">
              AI로 문체 카드 제안
            </h2>
            <p className="text-sm text-muted-foreground">
              인물 이름 근처의 대사를 원고에서 모아 문체 카드 초안을 승인 대기에 올립니다.
            </p>
          </div>
          {characters.length === 0 ? (
            <EmptyState title="아직 인물이 없습니다." />
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {characters.map((character) => (
                <li
                  key={character.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3"
                >
                  <span className="text-sm font-medium">{character.name}</span>
                  <SuggestButton workId={workId} entryId={character.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="style-cards-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="style-cards-heading" className="text-base font-semibold">
            문체 카드
          </h2>
          {canEdit && (
            <StyleCardDialog
              workId={workId}
              characters={characters}
              triggerLabel="문체 카드 추가"
            />
          )}
        </div>
        {cards.length === 0 ? (
          <EmptyState
            title="아직 문체 카드가 없습니다."
            description="인물의 말투와 예시를 적어 두면 초안이 그 목소리를 따릅니다."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {cards.map((card) => (
              <StyleCardView
                key={card.id}
                workId={workId}
                card={card}
                characters={characters}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </section>
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
        { success: '문체 카드 제안을 승인 대기에 올렸습니다.' },
      ),
    )
  }

  if (ai.running) {
    return (
      <AiRunStatus label="문체 제안 만드는 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
    )
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={suggest}>
      <SparklesIcon />
      AI로 문체 카드 제안
    </Button>
  )
}

function StyleCardView({
  workId,
  card,
  characters,
  canEdit,
}: {
  workId: string
  card: StyleCardItem
  characters: { id: string; name: string }[]
  canEdit: boolean
}) {
  const router = useRouter()
  return (
    <article className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-medium">{card.name}</h3>
          <p className="text-xs text-muted-foreground">
            연결 인물 <span className="text-foreground">{card.entryName ?? '없음'}</span>
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <StyleCardDialog
              workId={workId}
              characters={characters}
              card={card}
              triggerLabel="수정"
            />
            <ConfirmButton
              title="이 문체 카드를 보관할까요?"
              confirmLabel="보관"
              size="sm"
              onConfirm={async () => {
                const saved = await runAction(archiveStyleCardAction({ cardId: card.id }), {
                  success: '문체 카드를 보관했습니다.',
                })
                if (saved) router.refresh()
              }}
            >
              보관
            </ConfirmButton>
          </div>
        )}
      </div>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">말투</dt>
          <dd className="whitespace-pre-line">{card.tone || '-'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">규칙</dt>
          <dd className="whitespace-pre-line">{card.rules || '-'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">예시</dt>
          <dd className="whitespace-pre-line">{card.examples || '-'}</dd>
        </div>
      </dl>
    </article>
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
      <DialogTrigger render={<Button variant="outline" size="sm" />}>{triggerLabel}</DialogTrigger>
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
          success: '문체 카드를 저장했습니다.',
        })
      : await runAction(createStyleCardAction({ workId, ...fields }), {
          success: '문체 카드를 추가했습니다.',
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
