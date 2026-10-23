'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { runAction } from '@/lib/client/run-action'
import { useAiRun } from '@/lib/client/use-ai-run'
import type { DirectiveFinding } from '@/lib/directive-check'
import type { DirectiveForPrompt } from '@/lib/directives'
import { countTextEdits, type DraftPlanCard, type PlanEdits, planWarnings } from '@/lib/draft-plan'
import { parseDraftStream } from '@/lib/draft-stream'
import {
  createChapterFromDraftAction,
  draftFindingsAction,
  planDraftAction,
  recordDraftUseAction,
} from '@/server/actions/ai-features'
import { createDirectiveAction, listDirectivesAction } from '@/server/actions/wiki'
import type { WorkspaceApi, WritingData } from '../types'
import { DraftPlanCardView, type PlanEditKind } from './draft-plan-card'
import { DraftRefine } from './draft-refine'
import { EDITOR_ONLY_NOTE, canEditChapter } from './shared'

type DraftPanelProps = {
  data: WritingData
  api: WorkspaceApi
}

const TARGET_MIN = 500
const TARGET_MAX = 20000
const INSTRUCTION_PLACEHOLDER =
  '무슨 일이 일어나야 하나요? 비워 두면 위키와 지난 화를 보고 계획을 제안해요.'
const NO_EDITS: PlanEdits = { revisions: 0, removed: 0, moved: 0, textEdits: 0 }
// Shown while the stream is quiet for this long after the first text: the scenes are being expanded.
const FILLING_NOTE_MS = 3000
const FILLING_NOTE = '분량을 채우는 중'
const FINDINGS_TITLE = '요청과 다른 곳'
const USAGE_NOTICE =
  '초안 품질을 높이려고 초안을 쓴 횟수와 고친 글자 비율 같은 숫자만 셉니다. 원고 내용은 모으지 않습니다.'

/** One line per finding of a draft: which request it breaks, and where. */
function findingLine(finding: DirectiveFinding, directive: DirectiveForPrompt | undefined): string {
  if (finding.kind === 'ban') return `'${directive?.pattern ?? ''}' ${finding.count}곳`
  if (finding.kind === 'speech') {
    return `${directive?.entryName ?? '인물'}의 말투가 요청과 다른 대사 ${finding.count}곳`
  }
  return `분량이 요청한 ${directive?.targetChars ?? 0}자와 다릅니다`
}

/** The findings of a draft under it. Renders nothing without findings. */
export function DirectiveFindingsView({
  findings,
  directives,
}: {
  findings: DirectiveFinding[]
  directives: DirectiveForPrompt[]
}) {
  if (findings.length === 0) return null
  return (
    <div className="grid gap-1 rounded-lg border p-3 text-sm">
      <p className="font-medium">{FINDINGS_TITLE}</p>
      <ul className="grid gap-1 text-muted-foreground">
        {findings.map((finding) => (
          <li key={finding.directiveId + finding.kind}>
            {findingLine(
              finding,
              directives.find((d) => d.id === finding.directiveId),
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Active requests of the work, or null when the read fails. */
async function countActiveRequests(workId: string): Promise<number | null> {
  try {
    const result = await listDirectivesAction({ workId })
    return result.ok ? result.data.filter((row) => row.status === 'active').length : null
  } catch {
    return null
  }
}

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
  // The chapter plan card from 계획 세우기, and the author's edits to it. Null until a plan is made.
  const [card, setCard] = useState<DraftPlanCard | null>(null)
  const [planRunId, setPlanRunId] = useState<string | null>(null)
  const [planEdits, setPlanEdits] = useState<PlanEdits>(NO_EDITS)
  // The scene summaries the server sent with the current card: a summary that differs is a text edit.
  const [baseSummaries, setBaseSummaries] = useState<string[]>([])
  const [planning, setPlanning] = useState(false)
  // The instruction box: when checked, the next plan or quick draft also keeps the instruction as a request.
  const [keepInstruction, setKeepInstruction] = useState(false)
  // How many requests apply to the work now; null until the first count arrives.
  const [activeRequests, setActiveRequests] = useState<number | null>(null)
  const ai = useAiRun()
  const [draft, setDraft] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  // `complete` is set only when the whole draft arrived. `stopped` covers a cancel and a stream that
  // broke midway; those keep the partial text, but it cannot become a new chapter.
  const [complete, setComplete] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [appended, setAppended] = useState(false)
  // True while the open stream has been quiet for FILLING_NOTE_MS after its first text.
  const [filling, setFilling] = useState(false)
  const [creating, setCreating] = useState(false)
  // The request findings of the shown draft, from the server after the stream ends.
  const [findings, setFindings] = useState<{
    findings: DirectiveFinding[]
    directives: DirectiveForPrompt[]
  } | null>(null)
  // True while a 다듬기 preview is open; its buttons hold the append and new-chapter actions.
  const [refineOpen, setRefineOpen] = useState(false)
  const streaming = ai.running

  // Recounts the active requests; a failed read leaves the count line as it was.
  function refreshRequests() {
    void countActiveRequests(data.workId).then((count) => {
      if (count !== null) setActiveRequests(count)
    })
  }

  useEffect(() => {
    let live = true
    void countActiveRequests(data.workId).then((count) => {
      if (live && count !== null) setActiveRequests(count)
    })
    return () => {
      live = false
    }
  }, [data.workId])

  /**
   * Keeps the instruction as a request when its box is checked, then unchecks the box. It runs
   * beside the plan or the draft and never holds them up: a failure only shows its toast.
   */
  function keepInstructionRequest(text: string) {
    if (!keepInstruction || text === '') return
    void (async () => {
      await runAction(
        createDirectiveAction({
          workId: data.workId,
          scope: 'work',
          kind: 'content',
          text,
          source: 'instruction',
        }),
      )
      setKeepInstruction(false)
      void refreshRequests()
    })()
  }

  function toggleCharacter(id: string, checked: boolean) {
    setEntryIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  /**
   * Reads the streamed draft into state as it arrives. Resolves false when it failed or was aborted;
   * a failure midway keeps the text that arrived and shows the server's message.
   */
  async function streamDraft(
    signal: AbortSignal,
    body: {
      instructions: string
      targetChars: number
      plan?: DraftPlanCard
      planRunId?: string
      planEdits?: PlanEdits
    },
  ): Promise<boolean> {
    try {
      const response = await fetch(`/api/works/${data.workId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: data.chapter.id,
          entryIds,
          acceptsReplace: true,
          ...body,
        }),
        signal,
      })
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        toast.error(payload?.error ?? '초안을 쓰지 못했습니다.')
        setDraft(null)
        return false
      }
      const streamRunId = response.headers.get('X-Run-Id')
      setRunId(streamRunId)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let raw = ''
      let quiet: ReturnType<typeof setTimeout> | undefined
      // Each new piece of text restarts the quiet timer. Only the stall after the first text shows.
      const onText = () => {
        clearTimeout(quiet)
        setFilling(false)
        quiet = setTimeout(() => setFilling(true), FILLING_NOTE_MS)
      }
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done || signal.aborted) break
          const piece = decoder.decode(value, { stream: true })
          raw += piece
          if (piece !== '') onText()
          setDraft(parseDraftStream(raw).text)
        }
      } finally {
        clearTimeout(quiet)
        setFilling(false)
      }
      raw += decoder.decode()
      if (signal.aborted) return false
      // The route ends a draft that failed midway with an error record. It is not part of the text.
      const parsed = parseDraftStream(raw)
      setDraft(parsed.text)
      if (parsed.error !== null) {
        toast.error(parsed.error)
        return false
      }
      // The check is best effort: a failed read only leaves the findings out.
      if (streamRunId) {
        try {
          const found = await draftFindingsAction({ workId: data.workId, runId: streamRunId })
          if (found.ok) setFindings(found.data)
        } catch {
          // Leaves the findings out; the completed draft is not affected.
        }
      }
      return true
    } catch {
      if (!signal.aborted) toast.error('초안 작성이 중간에 끊겼습니다. 다시 시도해 주세요.')
      return false
    }
  }

  /** The target length from the input, or null after a toast says what to fix. */
  function checkedTarget(): number | null {
    const target = Number(targetChars)
    if (!Number.isInteger(target) || target < TARGET_MIN || target > TARGET_MAX) {
      toast.error(
        `목표 분량은 ${TARGET_MIN}자에서 ${TARGET_MAX.toLocaleString('ko-KR')}자 사이로 적어 주세요.`,
      )
      return null
    }
    return target
  }

  /** Asks the server for a chapter plan card. A note revises the current card instead. */
  async function plan(note?: string) {
    const target = checkedTarget()
    if (target === null) return
    const revising = card !== null && note !== undefined
    if (!revising) keepInstructionRequest(instructions.trim())
    setPlanning(true)
    const result = await runAction(
      planDraftAction({
        workId: data.workId,
        chapterId: data.chapter.id,
        instructions: instructions.trim(),
        targetChars: target,
        entryIds,
        ...(revising ? { revision: { card, note } } : {}),
      }),
    )
    setPlanning(false)
    if (!result) return
    // The text edits of the card being replaced are kept in the counts, as a revision adds to them.
    const replacedEdits = revising && card ? countTextEdits(card, baseSummaries) : 0
    setCard(result.card)
    setPlanRunId(result.runId)
    setBaseSummaries(result.card.scenes.map((scene) => scene.summary))
    // A new plan starts its own edit counts; a revision adds to the counts of the card it changes.
    setPlanEdits((prev) =>
      revising
        ? {
            ...prev,
            revisions: prev.revisions + 1,
            textEdits: prev.textEdits + replacedEdits,
          }
        : NO_EDITS,
    )
  }

  function editPlan(next: DraftPlanCard, edit?: PlanEditKind) {
    setCard(next)
    if (edit) setPlanEdits((prev) => ({ ...prev, [edit]: prev[edit] + 1 }))
  }

  /**
   * Writes the draft. `withPlan` sends the current card (the instruction may be empty then);
   * without it this is the quick path, which needs an instruction.
   */
  async function write(withPlan: boolean) {
    const trimmed = instructions.trim()
    if (!withPlan && trimmed === '') {
      toast.error('무슨 일이 일어나야 하는지 적어 주세요.')
      return
    }
    const target = checkedTarget()
    if (target === null) return
    if (!withPlan) keepInstructionRequest(trimmed)
    const planBody =
      withPlan && card && planRunId
        ? {
            plan: card,
            planRunId,
            planEdits: {
              ...planEdits,
              textEdits: planEdits.textEdits + countTextEdits(card, baseSummaries),
            },
          }
        : undefined

    setDraft('')
    setRunId(null)
    setComplete(false)
    setStopped(false)
    setAppended(false)
    setRefineOpen(false)
    setFindings(null)
    // Resolves null when the author cancels, false when the stream failed (a toast says why), and
    // true only when the whole draft arrived. Anything but true keeps the partial text as stopped.
    const completed = await ai.run((signal) =>
      streamDraft(signal, { instructions: trimmed, targetChars: target, ...planBody }),
    )
    if (completed !== true) {
      setStopped(true)
      // Nothing came through: drop the "waiting" placeholder instead of leaving it up forever.
      setDraft((prev) => (prev === '' ? null : prev))
    }
    setComplete(completed === true)
  }

  function appendToChapter() {
    if (!draft) return
    const current = api.getText()
    const separator = current === '' || current.endsWith('\n') ? '' : '\n\n'
    api.appendText(separator + draft)
    setAppended(true)
    // Numbers only: how often a draft was used and how long the manuscript was before the append.
    if (runId) {
      void recordDraftUseAction({
        workId: data.workId,
        chapterId: data.chapter.id,
        runId,
        priorChars: current.length,
      })
    }
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
  // The target as the card's scene lengths follow it; null while the input is not a valid target.
  const parsedTarget = Number(targetChars)
  const cardTarget =
    Number.isInteger(parsedTarget) && parsedTarget >= TARGET_MIN && parsedTarget <= TARGET_MAX
      ? parsedTarget
      : null

  return (
    <section aria-label="AI 초안" className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="draft-instructions">무슨 일이 일어나야 하나요?</Label>
        <Textarea
          id="draft-instructions"
          value={instructions}
          placeholder={INSTRUCTION_PLACEHOLDER}
          onChange={(event) => setInstructions(event.target.value)}
          rows={4}
          maxLength={5000}
          disabled={streaming}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="draft-keep-instruction"
            checked={keepInstruction}
            disabled={streaming}
            onCheckedChange={(checked) => setKeepInstruction(checked)}
          />
          <Label htmlFor="draft-keep-instruction">이 지시를 앞으로도 지키기</Label>
        </div>
        {activeRequests !== null && activeRequests > 0 && (
          <p className="text-sm text-muted-foreground">
            <span>{`적용 중인 요청 ${activeRequests}개`}</span>{' '}
            <Link className="underline" href={`/works/${data.workId}/wiki?tab=requests`}>
              보기
            </Link>
          </p>
        )}
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

      {card && (
        <DraftPlanCardView
          key={planRunId ?? 'plan'}
          card={card}
          warnings={planWarnings(card)}
          busy={planning || streaming}
          targetChars={cardTarget}
          workId={data.workId}
          onChange={editPlan}
          onRevise={(note) => void plan(note)}
          onWrite={() => void write(true)}
          onKept={() => void refreshRequests()}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {streaming ? (
          <AiRunStatus label="쓰는 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
        ) : (
          <>
            <Button onClick={() => void plan()} disabled={planning}>
              계획 세우기
            </Button>
            <Button
              variant="outline"
              onClick={() => void write(false)}
              disabled={instructions.trim() === '' || planning}
            >
              바로 쓰기
            </Button>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{USAGE_NOTICE}</p>

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
          {filling && <p className="text-xs text-muted-foreground">{FILLING_NOTE}</p>}
          <p className="text-xs text-muted-foreground">
            AI 초안은 작가가 고치고 저장해야 원고가 됩니다.
          </p>
          {stopped && <p className="text-sm text-muted-foreground">중간에 멈춘 초안입니다.</p>}
          {findings && (
            <DirectiveFindingsView findings={findings.findings} directives={findings.directives} />
          )}
          {finished && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={appendToChapter} disabled={appended || refineOpen}>
                {appended ? '원고 끝에 붙였습니다' : '현재 원고 끝에 붙이기'}
              </Button>
              {complete && runId && (
                <Button
                  variant="outline"
                  onClick={() => void createChapter()}
                  disabled={creating || refineOpen}
                >
                  새 회차로 만들기
                </Button>
              )}
            </div>
          )}
          {finished && complete && runId && !appended && (
            <DraftRefine
              key={runId}
              workId={data.workId}
              runId={runId}
              onPreviewChange={setRefineOpen}
              onApplied={(text) => setDraft(text)}
            />
          )}
        </div>
      )}
    </section>
  )
}
