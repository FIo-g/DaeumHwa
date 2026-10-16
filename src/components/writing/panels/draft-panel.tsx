'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { runAction } from '@/lib/client/run-action'
import { createChapterFromDraftAction } from '@/server/actions/ai-features'
import type { WorkspaceApi, WritingData } from '../types'
import { EDITOR_ONLY_NOTE, canEditChapter } from './shared'

type DraftPanelProps = {
  data: WritingData
  api: WorkspaceApi
}

const TARGET_MIN = 500
const TARGET_MAX = 20000

/**
 * AI draft (F13). Streams a chapter from the author's instructions, the story cards and the
 * previous chapter. The result is never written into the manuscript by itself: the author either
 * appends it to this chapter or turns it into a new chapter.
 */
export function DraftPanel({ data, api }: DraftPanelProps) {
  const editable = canEditChapter(data)
  const router = useRouter()
  const characters = data.entries.filter((entry) => entry.kind === 'character')

  const [instructions, setInstructions] = useState('')
  const [targetChars, setTargetChars] = useState(String(data.targetChars))
  const [entryIds, setEntryIds] = useState<string[]>([])
  const [streaming, setStreaming] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [appended, setAppended] = useState(false)
  const [creating, setCreating] = useState(false)

  function toggleCharacter(id: string, checked: boolean) {
    setEntryIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  async function write() {
    const trimmed = instructions.trim()
    if (trimmed === '') {
      toast.error('무슨 일이 일어나야 하는지 적어 주세요.')
      return
    }
    const target = Number(targetChars)
    if (!Number.isInteger(target) || target < TARGET_MIN || target > TARGET_MAX) {
      toast.error(
        `목표 분량은 ${TARGET_MIN}자에서 ${TARGET_MAX.toLocaleString('ko-KR')}자 사이로 적어 주세요.`,
      )
      return
    }

    setStreaming(true)
    setDraft('')
    setRunId(null)
    setAppended(false)
    try {
      const response = await fetch(`/api/works/${data.workId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: data.chapter.id,
          instructions: trimmed,
          targetChars: target,
          entryIds,
        }),
      })
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        toast.error(payload?.error ?? '초안을 쓰지 못했습니다.')
        setDraft(null)
        return
      }
      setRunId(response.headers.get('X-Run-Id'))
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let text = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setDraft(text)
      }
      text += decoder.decode()
      setDraft(text)
    } catch {
      toast.error('초안 작성이 중간에 끊겼습니다. 다시 시도해 주세요.')
    } finally {
      setStreaming(false)
    }
  }

  function appendToChapter() {
    if (!draft) return
    const current = api.getText()
    const separator = current === '' || current.endsWith('\n') ? '' : '\n\n'
    api.appendText(separator + draft)
    setAppended(true)
    toast.success('원고 끝에 붙였습니다. 저장은 자동으로 됩니다.')
  }

  async function createChapter() {
    if (!runId) return
    setCreating(true)
    await api.saveNow()
    const chapter = await runAction(createChapterFromDraftAction({ workId: data.workId, runId }), {
      success: '초안으로 새 회차를 만들었습니다.',
    })
    setCreating(false)
    if (chapter) router.push(`/works/${data.workId}/chapters/${chapter.id}`)
  }

  if (!editable) {
    return <p className="text-sm text-muted-foreground">{EDITOR_ONLY_NOTE}</p>
  }

  const finished = !streaming && draft !== null && draft.length > 0

  return (
    <section aria-label="AI 초안" className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="draft-instructions">무슨 일이 일어나야 하나요?</Label>
        <Textarea
          id="draft-instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={4}
          maxLength={5000}
          disabled={streaming}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="draft-target">목표 분량 (자)</Label>
        <Input
          id="draft-target"
          type="number"
          inputMode="numeric"
          min={TARGET_MIN}
          max={TARGET_MAX}
          value={targetChars}
          onChange={(event) => setTargetChars(event.target.value)}
          disabled={streaming}
        />
      </div>

      {characters.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">등장 인물</legend>
          {characters.map((character) => {
            const id = `draft-char-${character.id}`
            return (
              <div key={character.id} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={entryIds.includes(character.id)}
                  disabled={streaming}
                  onCheckedChange={(checked) => toggleCharacter(character.id, checked)}
                />
                <Label htmlFor={id}>{character.name}</Label>
              </div>
            )
          })}
        </fieldset>
      )}

      <div>
        <Button onClick={() => void write()} disabled={streaming || instructions.trim() === ''}>
          {streaming ? '쓰는 중… (AI)' : '초안 쓰기'}
        </Button>
      </div>

      {draft !== null && (
        <div className="grid gap-3">
          <div
            role="region"
            aria-label="AI 초안 미리보기"
            aria-live="polite"
            className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm leading-7"
          >
            {draft === '' ? '초안을 기다리는 중입니다.' : draft}
          </div>
          <p className="text-xs text-muted-foreground">
            AI 초안은 작가가 고치고 저장해야 원고가 됩니다.
          </p>
          {finished && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={appendToChapter} disabled={appended}>
                {appended ? '원고 끝에 붙였습니다' : '현재 원고 끝에 붙이기'}
              </Button>
              {runId && (
                <Button variant="outline" onClick={() => void createChapter()} disabled={creating}>
                  새 회차로 만들기
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
