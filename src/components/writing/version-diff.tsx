'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/app/confirm-button'
import { getTextWorker } from '@/lib/client/worker-client'
import { runAction } from '@/lib/client/run-action'
import { type DiffPart, diffStats } from '@/lib/diff'
import { getVersionAction, restoreVersionAction } from '@/server/actions/manuscript'

type VersionDiffProps = {
  workId: string
  chapterId: string
  versionId: string
  versionNumber: number
  currentBody: string
  currentVersion: number
  canRestore: boolean
}

type DiffState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; parts: DiffPart[] }

/** Compares the selected version with the latest manuscript in restoration order. */
export function VersionDiff({
  workId,
  chapterId,
  versionId,
  versionNumber,
  currentBody,
  currentVersion,
  canRestore,
}: VersionDiffProps) {
  const router = useRouter()
  const [state, setState] = useState<DiffState>({ status: 'loading' })

  useEffect(() => {
    // The parent remounts this component per version (key), so the first state is 'loading'.
    let cancelled = false
    void (async () => {
      const version = await getVersionAction({ versionId })
      if (cancelled) return
      if (!version.ok) {
        setState({ status: 'error' })
        return
      }
      const parts = await getTextWorker().diffTexts(currentBody, version.data.body, 'words')
      if (!cancelled) setState({ status: 'ready', parts })
    })().catch(() => {
      if (!cancelled) setState({ status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [versionId, currentBody])

  async function restore() {
    const result = await runAction(
      restoreVersionAction({ versionId, expectedVersion: currentVersion }),
      { success: `버전 ${versionNumber}으로 되돌렸어요.` },
    )
    if (result) router.push(`/works/${workId}/chapters/${chapterId}`)
  }

  return (
    <section
      aria-label="버전 비교"
      className="b-writing-history-diff b-paper flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="b-subhead">버전 {versionNumber}과 현재 원고 비교</h2>
        {canRestore && (
          <ConfirmButton
            title="이 버전으로 되돌릴까요?"
            description="선택한 버전의 내용으로 원고를 바꿔요. 현재 원고도 이력에 남아요."
            confirmLabel="되돌리기"
            onConfirm={restore}
          >
            이 버전으로 복원
          </ConfirmButton>
        )}
      </div>

      {state.status === 'loading' && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {state.status === 'error' && <p className="text-sm text-ink">버전을 불러오지 못했어요.</p>}
      {state.status === 'ready' && <DiffBody parts={state.parts} />}
    </section>
  )
}

function DiffBody({ parts }: { parts: DiffPart[] }) {
  const stats = diffStats(parts)
  return (
    <>
      <p className="text-xs text-muted-foreground">
        <span className="rounded-field bg-kraft px-1.5 py-0.5 text-ink">
          이 버전에만 있는 글 {stats.inserted}자
        </span>
        {' · '}
        <span className="text-ink underline decoration-dashed underline-offset-4">
          현재 원고에만 있는 글 {stats.deleted}자
        </span>
      </p>
      <div className="max-h-[70vh] overflow-y-auto rounded-card border border-ink bg-paper p-4 text-[15px] leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">
        {parts.length === 0 && <span className="text-muted-foreground">내용이 없어요.</span>}
        {parts.map((part, index) => {
          if (part.type === 'insert') {
            return (
              <ins key={index} className="bg-kraft text-ink no-underline">
                {part.value}
              </ins>
            )
          }
          if (part.type === 'delete') {
            return (
              <del
                key={index}
                className="bg-muted text-ink line-through decoration-ink decoration-2"
              >
                {part.value}
              </del>
            )
          }
          return <span key={index}>{part.value}</span>
        })}
      </div>
    </>
  )
}
