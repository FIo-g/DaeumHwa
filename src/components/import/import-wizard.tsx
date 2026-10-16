'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ImportJobRow, ImportJobStatus } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
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

  async function handleParsed(file: { fileName: string; text: string }) {
    setSplitting(true)
    try {
      const result = await getTextWorker().splitChapters(file.text)
      setPreview({ fileName: file.fileName, method: result.method, chapters: result.chapters })
      setStep('preview')
    } catch {
      toast.error('회차를 나누지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setSplitting(false)
    }
  }

  async function startUpload(file: Preview, drafts: DraftChapter[]) {
    setStep('uploading')
    setUploaded(0)
    setUploadTotal(drafts.length)
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
      const result = await runAction(appendImportChaptersAction({ jobId: job.id, chapters: batch }))
      if (!result) {
        // The job exists but is incomplete. Show it so the author can cancel it.
        finishUpload(toSnapshot(job))
        return
      }
      setUploaded(result.received)
    }

    const started = await runAction(startImportJobAction({ jobId: job.id }), {
      success: '가져오기를 시작했습니다.',
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
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            원고 파일을 고르면 회차를 나눠 보여 드립니다. 나눈 회차는 기존 회차 뒤에 완료 상태로
            추가되고, 회차마다 설정 카드 후보를 뽑습니다.
          </p>

          {step === 'file' && (
            <>
              <FileDrop disabled={splitting} onParsed={handleParsed} />
              {splitting && (
                <p role="status" className="text-sm text-muted-foreground">
                  회차를 나누는 중입니다.
                </p>
              )}
            </>
          )}

          {step === 'preview' && preview && (
            <SplitPreview
              method={preview.method}
              initial={preview.chapters}
              onBack={() => {
                setPreview(null)
                setStep('file')
              }}
              onConfirm={(drafts) => void startUpload(preview, drafts)}
            />
          )}

          {step === 'uploading' && (
            <p role="status" className="text-sm font-medium">
              {`${uploaded}/${uploadTotal}화 올리는 중`}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          원고 가져오기는 편집자 이상만 시작할 수 있습니다.
        </p>
      )}

      {!current && jobs.length > 0 && (
        <section aria-label="가져오기 기록" className="grid gap-3">
          <h2 className="font-semibold">가져오기 기록</h2>
          <ul className="grid gap-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div className="grid gap-0.5">
                  <span className="font-medium">{job.fileName}</span>
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
