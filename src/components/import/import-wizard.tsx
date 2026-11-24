'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ImportJobRow, ImportJobStatus } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { seoulToday } from '@/lib/dates'
import { getTextWorker } from '@/lib/client/worker-client'
import type { SplitChapter, SplitMethod } from '@/lib/import/split'
import {
  appendImportChaptersAction,
  createImportJobAction,
  startImportJobAction,
} from '@/server/actions/imports'
import { FileDrop } from './file-drop'
import {
  IMPORT_STATUS_LABEL,
  ImportProgress,
  type ImportJobSnapshot,
  toSnapshot,
} from './import-progress'
import { ImportMeter, ImportStages } from './import-stages'
import { type DraftChapter, SplitPreview } from './split-preview'

// The service takes at most 50 chapters per append call (keeps request bodies small on Vercel).
const UPLOAD_BATCH = 50
const ACTIVE_STATUSES: ImportJobStatus[] = ['uploading', 'queued', 'running', 'paused', 'error']

type Preview = { fileName: string; method: SplitMethod; chapters: SplitChapter[] }
type Step = 'file' | 'preview' | 'uploading'

type ImportWizardProps = {
  workId: string
  canEdit: boolean
  jobs: ImportJobRow[]
}

/**
 * The import page. Shows the one unfinished job if there is one; otherwise walks the author
 * through file, preview and upload. Earlier jobs are listed below.
 */
export function ImportWizard({ workId, canEdit, jobs }: ImportWizardProps) {
  const router = useRouter()
  const [current, setCurrent] = useState<ImportJobSnapshot | null>(() => {
    const active = jobs.find((job) => ACTIVE_STATUSES.includes(job.status))
    return active ? toSnapshot(active) : null
  })
  const [step, setStep] = useState<Step>('file')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [splitting, setSplitting] = useState(false)
  const [uploaded, setUploaded] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  // Chapters the author already published count as published today, not as buffer.
  const [alreadyPublished, setAlreadyPublished] = useState(false)

  async function handleParsed(file: { fileName: string; text: string }) {
    setSplitting(true)
    try {
      const result = await getTextWorker().splitChapters(file.text)
      setPreview({ fileName: file.fileName, method: result.method, chapters: result.chapters })
      setStep('preview')
    } catch {
      toast.error('회차를 나누지 못했어요. 다시 시도해 주세요.')
    } finally {
      setSplitting(false)
    }
  }

  async function startUpload(file: Preview, drafts: DraftChapter[]) {
    setStep('uploading')
    setUploaded(0)
    setUploadTotal(drafts.length)
    const publishedOn = alreadyPublished ? seoulToday() : null
    const job = await runAction(
      createImportJobAction({
        workId,
        fileName: file.fileName,
        totalChapters: drafts.length,
      }),
    )
    if (!job) {
      setStep('preview')
      return
    }

    for (let offset = 0; offset < drafts.length; offset += UPLOAD_BATCH) {
      const batch = drafts
        .slice(offset, offset + UPLOAD_BATCH)
        .map((draft) => ({ title: draft.title, body: draft.body }))
      const result = await runAction(
        appendImportChaptersAction({ jobId: job.id, chapters: batch, publishedOn }),
      )
      if (!result) {
        // The job exists but is incomplete. Show it so the author can cancel it.
        finishUpload(toSnapshot(job))
        return
      }
      setUploaded(result.received)
    }

    const started = await runAction(startImportJobAction({ jobId: job.id }), {
      success: '가져오기를 시작했어요.',
    })
    finishUpload(toSnapshot(started ?? job))
  }

  function finishUpload(snapshot: ImportJobSnapshot) {
    setPreview(null)
    setStep('file')
    setCurrent(snapshot)
    router.refresh()
  }

  return (
    <div className="grid gap-6">
      {current ? (
        <ImportProgress
          key={current.id}
          workId={workId}
          initial={current}
          canEdit={canEdit}
          onClose={() => setCurrent(null)}
        />
      ) : canEdit ? (
        <ImportStages
          stage={step === 'file' && !splitting ? 1 : 2}
          running={splitting || step === 'uploading'}
        >
          <div className="grid min-w-0 gap-4">
            {step === 'file' && !splitting && <FileDrop onParsed={handleParsed} />}
            {splitting && (
              <p role="status" className="text-sm text-muted-ink">
                회차를 나누고 있어요.
              </p>
            )}

            {step === 'preview' && preview && (
              <>
                <p className="text-sm text-muted-ink">
                  가져온 회차는 기존 회차 뒤에 완료 상태로 추가돼요.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={alreadyPublished}
                    onChange={(event) => setAlreadyPublished(event.target.checked)}
                  />
                  이미 연재한 원고예요 (비축분에서 제외)
                </label>
                <SplitPreview
                  method={preview.method}
                  initial={preview.chapters}
                  onBack={() => {
                    setPreview(null)
                    setStep('file')
                  }}
                  onConfirm={(drafts) => void startUpload(preview, drafts)}
                />
              </>
            )}

            {step === 'uploading' && (
              <div className="grid gap-2">
                <p
                  role="status"
                  className="text-sm font-medium"
                >{`${uploaded}/${uploadTotal}화 올리는 중`}</p>
                <ImportMeter
                  value={uploadTotal === 0 ? 0 : Math.round((uploaded / uploadTotal) * 100)}
                  label="파일 올리기 진행률"
                />
              </div>
            )}
          </div>
        </ImportStages>
      ) : (
        <p className="text-sm text-muted-foreground">편집자 이상만 원고를 가져올 수 있어요.</p>
      )}

      {!current && jobs.length > 0 && (
        <section aria-label="가져오기 기록" className="grid gap-3">
          <h2 className="b-heading">가져오기 기록</h2>
          <ul className="grid divide-y rounded-card border border-ink">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="b-tools-index-row flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <div className="grid min-w-0 gap-0.5 wrap-anywhere">
                  <span className="b-row__title">{job.fileName}</span>
                  <span className="text-muted-foreground">
                    {`${job.processedChapters}/${job.totalChapters}화`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{IMPORT_STATUS_LABEL[job.status]}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${job.fileName} 보기`}
                    onClick={() => setCurrent(toSnapshot(job))}
                  >
                    보기
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
