'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useId, useState } from 'react'
import { SubmitButton } from '@/components/app/submit-button'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { runAction } from '@/lib/client/run-action'
import { createRelationAction, updateRelationAction } from '@/server/actions/relations'
import { type GraphEdge, type GraphNode, RELATION_KIND_SUGGESTIONS } from './graph-model'

type RelationFormProps = {
  workId: string
  nodes: GraphNode[]
  /** When given, the form edits this relation instead of creating one. */
  relation?: GraphEdge
  /** Preselected first card when creating (for example the card selected in the graph). */
  defaultSourceId?: string | null
  defaultTargetId?: string | null
  onDone: () => void
}

/** Empty input means open-ended. Anything else is read as a chapter number. */
function parsePosition(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  return Number(trimmed)
}

/** Two cards, a relation kind, and an optional range of chapters where it holds. */
export function RelationForm({
  workId,
  nodes,
  relation,
  defaultSourceId = null,
  defaultTargetId = null,
  onDone,
}: RelationFormProps) {
  const router = useRouter()
  const ids = useId()
  const editing = relation !== undefined
  const nameOf = (id: string | null) => nodes.find((n) => n.id === id)?.name

  const [sourceId, setSourceId] = useState<string | null>(
    relation ? relation.source : defaultSourceId,
  )
  const [targetId, setTargetId] = useState<string | null>(
    relation ? relation.target : defaultTargetId,
  )
  const [kind, setKind] = useState(relation?.kind ?? '')
  const [description, setDescription] = useState(relation?.description ?? '')
  const [directed, setDirected] = useState(relation?.directed ?? false)
  const [start, setStart] = useState(relation?.startPosition?.toString() ?? '')
  const [end, setEnd] = useState(relation?.endPosition?.toString() ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sourceId || !targetId) {
      setFormError('두 카드를 골라 주세요.')
      return
    }
    setFormError(null)
    setPending(true)
    try {
      const fields = {
        sourceEntryId: sourceId,
        targetEntryId: targetId,
        kind: kind.trim(),
        description,
        directed,
        startPosition: parsePosition(start),
        endPosition: parsePosition(end),
      }
      const saved = relation
        ? await runAction(updateRelationAction({ relationId: relation.id, ...fields }), {
            success: '관계를 고쳤습니다.',
          })
        : await runAction(createRelationAction({ workId, ...fields }), {
            success: '관계를 추가했습니다.',
          })
      if (saved) {
        router.refresh()
        onDone()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-source`}>첫 번째 카드</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger id={`${ids}-source`} className="w-full">
              <SelectValue>{(v: string | null) => nameOf(v) ?? '카드 고르기'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {nodes.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-target`}>두 번째 카드</Label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger id={`${ids}-target`} className="w-full">
              <SelectValue>{(v: string | null) => nameOf(v) ?? '카드 고르기'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {nodes.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${ids}-kind`}>관계 종류</Label>
        <Input
          id={`${ids}-kind`}
          value={kind}
          maxLength={30}
          required
          placeholder="예: 가족"
          onChange={(e) => setKind(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5" aria-label="자주 쓰는 관계 종류">
          {RELATION_KIND_SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              size="sm"
              variant={kind === suggestion ? 'default' : 'outline'}
              aria-pressed={kind === suggestion}
              onClick={() => setKind(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-description`}>설명</Label>
        <Input
          id={`${ids}-description`}
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-start`}>시작 회차</Label>
          <Input
            id={`${ids}-start`}
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            value={start}
            placeholder="처음부터"
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-end`}>끝 회차</Label>
          <Input
            id={`${ids}-end`}
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            value={end}
            placeholder="계속"
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${ids}-directed`}
          checked={directed}
          onCheckedChange={(checked) => setDirected(checked)}
        />
        <Label htmlFor={`${ids}-directed`} className="font-normal">
          방향 있음
        </Label>
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <div>
        <SubmitButton pending={pending}>{editing ? '저장' : '관계 추가'}</SubmitButton>
      </div>
    </form>
  )
}
