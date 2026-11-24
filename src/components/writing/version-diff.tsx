'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/app/confirm-button'
import { Sheet } from '@/components/motion'
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
  replay: boolean
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
  replay,
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
    <Sheet
      aria-label="버전 비교"
      page={String(versionNumber).padStart(2, '0')}
      className="wg-chapters-proof min-w-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="b-subhead">버전 {versionNumber}과 현재 원고 비교</h2>
        {canRestore && (
          <ConfirmButton
            title="이 버전으로 되돌릴까요?"
            description="선택한 버전의 내용으로 원고를 바꿔요. 현재 원고도 이력에 남아요."
            confirmLabel="되돌리기"
            variant="link"
            onConfirm={restore}
          >
            이 버전으로 복원
          </ConfirmButton>
        )}
      </div>

      {state.status === 'loading' && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {state.status === 'error' && <p className="text-sm text-ink">버전을 불러오지 못했어요.</p>}
      {state.status === 'ready' && <DiffBody parts={state.parts} replay={replay} />}
    </Sheet>
  )
}

function DiffBody({ parts, replay }: { parts: DiffPart[]; replay: boolean }) {
  const stats = diffStats(parts)
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-ink">
        <span>
          이 버전에만 있는 글 <span className="font-mono">{stats.inserted}자</span>
        </span>
        <span>·</span>
        <span className="text-muted-ink">
          현재 원고에만 있는 글 <span className="font-mono">{stats.deleted}자</span>
        </span>
      </p>
      <div className="wg-chapters-proof-scroll b-manuscript" data-replay={replay || undefined}>
        <div className="wg-chapters-proof-lines">
          <div>
            {parts.length === 0 && <span className="text-muted-ink">내용이 없어요.</span>}
            {parts.map(({ type, value }, index) => {
              if (type === 'insert') return <ins key={index}>{value}</ins>
              if (type === 'delete') return <del key={index}>{value}</del>
              return <span key={index}>{value}</span>
            })}
          </div>
          {(stats.inserted > 0 || stats.deleted > 0) && (
            <div className="wg-chapters-proof-marks" aria-hidden="true">
              {parts.map(({ type, value }, index) => (
                <span key={index} data-mark={type} data-content={value} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
