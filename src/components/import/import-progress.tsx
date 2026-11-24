'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ConfirmButton } from '@/components/app/confirm-button'
import { PopLink } from '@/components/motion'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ImportJobRow, ImportJobStatus } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import {
  cancelImportJobAction,
  pauseImportJobAction,
  skipImportChapterAction,
  startImportJobAction,
} from '@/server/actions/imports'
import { ImportMeter, ImportStages } from './import-stages'

// Import progress (F6 step 5). The page polls the job status. When no Inngest runner is set up,
// this component also drives the job: it calls the advance route one chapter at a time while
// the job is running and the page is open.

const POLL_MS = 2000
const RETRY_MS = 3000
const MAX_FAILURES = 5
const CONNECTION_MESSAGE = '연결이 끊겼어요. 다시 시도하거나 페이지를 새로 고쳐 주세요.'
const FALLBACK_ERROR = '가져오지 못했어요.'

export const IMPORT_STATUS_LABEL: Record<ImportJobStatus, string> = {
  uploading: '올리는 중',
  queued: '대기 중',
  running: '진행 중',
  paused: '일시정지',
  done: '완료',
  error: '오류',
  cancelled: '취소',
}

const TERMINAL: ImportJobStatus[] = ['done', 'cancelled']
const CANCELABLE: ImportJobStatus[] = ['uploading', 'running', 'paused', 'error']

/** The job fields the import page shows. Dates are left out so the snapshot survives JSON. */
export type ImportJobSnapshot = Pick<
  ImportJobRow,
  'id' | 'fileName' | 'status' | 'runner' | 'processedChapters' | 'totalChapters' | 'error'
> & {
  /** Positions of the chapters the author skipped after they stopped the job. */
  skipped: number[]
  started: boolean
}

export function toSnapshot(job: ImportJobRow): ImportJobSnapshot {
  return {
    id: job.id,
    fileName: job.fileName,
    status: job.status,
    runner: job.runner,
    processedChapters: job.processedChapters,
    totalChapters: job.totalChapters,
    error: job.error,
    skipped: skippedPositionsOf(job.state),
    started: job.startedAt !== null,
  }
}

type ImportProgressProps = {
  workId: string
  initial: ImportJobSnapshot
  canEdit: boolean
  chapterLabels?: (string | undefined)[]
  /** Shown for finished or cancelled jobs. Returns the page to the upload step. */
  onClose?: () => void
}

/** Status, progress and the pause / resume / cancel controls of one import job. */
export function ImportProgress({
  workId,
  initial,
  canEdit,
  chapterLabels,
  onClose,
}: ImportProgressProps) {
  const router = useRouter()
  const [job, setJob] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [kick, setKick] = useState(0)
  const alive = useRef(true)
  const driving = useRef(false)
  const previousStatus = useRef(initial.status)

  const { id: jobId, status, runner } = job

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // Keep the status in sync with the server, so a second tab or a reload shows the same state.
  useEffect(() => {
    const timer = setInterval(() => {
      void fetchPoll(jobId).then((poll) => {
        if (!alive.current || !poll) return
        // A poll that started before the last advance or pause can be behind it: never move
        // progress back, and never move a finished or cancelled job back to running.
        setJob((prev) => {
          if (poll.processedChapters < prev.processedChapters) return prev
          if (TERMINAL.includes(prev.status) && !TERMINAL.includes(poll.status)) return prev
          return { ...prev, ...poll, started: prev.started || poll.status === 'running' }
        })
      })
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [jobId])

  // Drives a running client-runner job one chapter at a time while this page is open.
  useEffect(() => {
    if (!canEdit || status !== 'running' || runner !== 'client') return
    if (driving.current) return
    driving.current = true
    void (async () => {
      let failures = 0
      try {
        while (alive.current) {
          const outcome = await advanceOnce(jobId)
          if (!alive.current) return
          if (outcome.kind === 'network') {
            failures += 1
            if (failures >= MAX_FAILURES) {
              setNotice(CONNECTION_MESSAGE)
              return
            }
            await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
            continue
          }
          failures = 0
          if (outcome.kind === 'failed') {
            setNotice(outcome.message)
            return
          }
          const { body } = outcome
          setJob((prev) => ({
            ...prev,
            status: body.status,
            processedChapters: body.processed,
            totalChapters: body.total,
            error: body.message,
          }))
          if (body.status !== 'running') return
        }
      } finally {
        driving.current = false
      }
    })()
  }, [canEdit, jobId, status, runner, kick])

  // Refresh the server-rendered job list once the job finishes or is cancelled.
  useEffect(() => {
    if (previousStatus.current !== status && TERMINAL.includes(status)) router.refresh()
    previousStatus.current = status
  }, [status, router])

  async function pause() {
    setBusy(true)
    const row = await runAction(pauseImportJobAction({ jobId }))
    setBusy(false)
    if (row) setJob(toSnapshot(row))
  }

  async function start() {
    setBusy(true)
    const row = await runAction(startImportJobAction({ jobId }), {
      success: '가져오기를 시작했어요.',
    })
    setBusy(false)
    if (row) {
      setNotice(null)
      setJob(toSnapshot(row))
    }
  }

  // Skips the chapter that stopped the job, then resumes it at the next chapter.
  async function skip() {
    setBusy(true)
    const skippedRow = await runAction(skipImportChapterAction({ jobId }), {
      success: '이 화를 건너뛰었어요.',
    })
    if (skippedRow) {
      setNotice(null)
      setJob(toSnapshot(skippedRow))
      if (skippedRow.status !== 'done') {
        const resumed = await runAction(startImportJobAction({ jobId }))
        if (resumed) setJob(toSnapshot(resumed))
      }
    }
    setBusy(false)
  }

  async function cancel() {
    const row = await runAction(cancelImportJobAction({ jobId }), {
      success: '가져오기를 취소했어요.',
    })
    if (row) setJob(toSnapshot(row))
  }

  function retry() {
    setNotice(null)
    setKick((count) => count + 1)
  }

  const canStart = canEdit && status === 'uploading'
  const canPause = canEdit && status === 'running'
  const canResume = canEdit && (status === 'paused' || status === 'error')
  const canRetry = canEdit && status === 'running' && runner === 'client' && notice !== null
  const canCancel = canEdit && CANCELABLE.includes(status)
  const canSkip = canEdit && status === 'error'
  const activeChapter = chapterLabels?.[job.processedChapters]
  const beforeExtraction = status === 'uploading' || (status === 'cancelled' && !job.started)

  return (
    <ImportStages stage={status === 'done' ? 4 : beforeExtraction ? 2 : 3}>
      <section aria-label="가져오기 진행 상황" className="grid min-w-0 gap-4">
        <div className="wg-import-write flex flex-wrap items-start justify-between gap-2">
          <div className="grid min-w-0 gap-1 font-mono">
            <p className="wrap-anywhere">{job.fileName}</p>
            <p className="text-sm text-muted-ink">
              {`${job.processedChapters}/${job.totalChapters}화 처리`}
            </p>
          </div>
          <Badge variant="outline">{IMPORT_STATUS_LABEL[status]}</Badge>
        </div>

        <ImportMeter
          completed={job.processedChapters}
          total={job.totalChapters}
          label="처리 진행률"
        />

        {status === 'running' && activeChapter && (
          <p
            key={job.processedChapters}
            className="wg-import-processing font-heading font-bold wrap-anywhere"
          >
            {activeChapter}
          </p>
        )}

        {status === 'running' && (
          <p className="wg-import-write text-sm text-muted-ink">
            {runner === 'client'
              ? '회차를 처리하는 동안 이 화면을 열어 두세요.'
              : '이 화면을 닫아도 회차를 처리해요.'}
          </p>
        )}
        {status === 'uploading' && (
          <p className="wg-import-write text-sm text-muted-ink">
            원고를 올리다 멈춘 작업일 수 있어요. 가져오기 시작 전 전체 회차가 올라갔는지 확인해
            주세요.
          </p>
        )}
        {status === 'done' && (
          <p className="wg-import-write text-sm text-muted-ink">
            승인한 카드와 사실만 위키에 들어가요.
          </p>
        )}
        {status === 'cancelled' && (
          <p className="wg-import-write text-sm text-muted-ink">가져오기를 취소했어요.</p>
        )}

        {job.skipped.length > 0 && (
          <p className="wg-import-write text-sm text-muted-ink">
            {`건너뛴 회차: ${job.skipped.map((position) => `${position}화`).join(', ')}`}
          </p>
        )}

        {job.error && (
          <Alert variant="destructive">
            <AlertDescription className="wrap-anywhere">{job.error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert variant="destructive">
            <AlertDescription className="wrap-anywhere">{notice}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {canStart && (
            <Button onClick={start} disabled={busy}>
              가져오기 시작
            </Button>
          )}
          {canPause && (
            <Button variant="outline" onClick={pause} disabled={busy}>
              일시정지
            </Button>
          )}
          {canResume && (
            <Button onClick={start} disabled={busy}>
              재개
            </Button>
          )}
          {canSkip && (
            <ConfirmButton
              title="이 화를 건너뛸까요?"
              description="이 회차의 원고는 남아요. 설정 후보 추출은 다음 화부터 이어가요."
              confirmLabel="건너뛰기"
              onConfirm={skip}
              disabled={busy}
            >
              이 화 건너뛰기
            </ConfirmButton>
          )}
          {canRetry && (
            <Button variant="outline" onClick={retry} disabled={busy}>
              다시 시도
            </Button>
          )}
          {canCancel && (
            <ConfirmButton
              title="가져오기를 취소할까요?"
              description="이미 올린 회차와 기존 제안은 남아요."
              confirmLabel="취소하기"
              onConfirm={cancel}
            >
              취소
            </ConfirmButton>
          )}
          {status === 'done' && (
            <>
              <PopLink href={`/works/${workId}/approvals`} arrow={false}>
                승인 대기에서 확인하기
              </PopLink>
              <PopLink variant="flat" href={`/works/${workId}/wiki`} arrow={false}>
                설정 보드 보기
              </PopLink>
            </>
          )}
          {onClose && TERMINAL.includes(status) && (
            <Button variant="ghost" onClick={onClose}>
              {canEdit ? '새로 가져오기' : '목록으로'}
            </Button>
          )}
        </div>
      </section>
    </ImportStages>
  )
}

type PollResult = Pick<
  ImportJobSnapshot,
  'status' | 'processedChapters' | 'totalChapters' | 'error'
>

async function fetchPoll(jobId: string): Promise<PollResult | null> {
  try {
    const response = await fetch(`/api/import-jobs/${jobId}`, { cache: 'no-store' })
    if (!response.ok) return null
    return readPoll(await response.json())
  } catch {
    return null
  }
}

/** Positions of the skipped chapters, read from the job state. The server writes `state.skipped`. */
function skippedPositionsOf(state: ImportJobRow['state']): number[] {
  const skipped: unknown = (state as { skipped?: unknown }).skipped
  if (!Array.isArray(skipped)) return []
  return skipped.flatMap((item: unknown) =>
    isRecord(item) && typeof item.position === 'number' ? [item.position] : [],
  )
}

function readPoll(value: unknown): PollResult | null {
  if (!isRecord(value)) return null
  if (typeof value.status !== 'string') return null
  if (typeof value.processedChapters !== 'number' || typeof value.totalChapters !== 'number') {
    return null
  }
  return {
    status: value.status as ImportJobStatus,
    processedChapters: value.processedChapters,
    totalChapters: value.totalChapters,
    error: typeof value.error === 'string' ? value.error : null,
  }
}

type AdvanceBody = {
  status: ImportJobStatus
  processed: number
  total: number
  done: boolean
  message: string | null
}

type AdvanceOutcome =
  { kind: 'ok'; body: AdvanceBody } | { kind: 'failed'; message: string } | { kind: 'network' }

/** One call to the advance route. Server errors and network errors count as retryable. */
async function advanceOnce(jobId: string): Promise<AdvanceOutcome> {
  let response: Response
  try {
    response = await fetch(`/api/import-jobs/${jobId}/advance`, { method: 'POST' })
  } catch {
    return { kind: 'network' }
  }
  const body: unknown = await response.json().catch(() => null)
  if (response.ok) {
    const parsed = readAdvanceBody(body)
    return parsed ? { kind: 'ok', body: parsed } : { kind: 'network' }
  }
  if (response.status >= 500) return { kind: 'network' }
  return { kind: 'failed', message: readErrorMessage(body) }
}

function readAdvanceBody(value: unknown): AdvanceBody | null {
  if (!isRecord(value)) return null
  if (typeof value.status !== 'string') return null
  if (typeof value.processed !== 'number' || typeof value.total !== 'number') return null
  return {
    status: value.status as ImportJobStatus,
    processed: value.processed,
    total: value.total,
    done: value.done === true,
    message: typeof value.message === 'string' ? value.message : null,
  }
}

function readErrorMessage(value: unknown): string {
  if (isRecord(value) && typeof value.error === 'string') return value.error
  return FALLBACK_ERROR
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
