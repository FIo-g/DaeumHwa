'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Sheet } from '@/components/motion'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { ImportJobRow, ImportJobStatus } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { seoulToday } from '@/lib/dates'
import { getTextWorker } from '@/lib/client/worker-client'
import type { SplitChapter, SplitMethod } from '@/lib/import/split'
import { stripEpisodePrefix } from '@/lib/labels'
import {
  appendImportChaptersAction,
  createImportJobAction,
  startImportJobAction,
} from '@/server/actions/imports'
import { FileDetails, FileDrop, type SelectedFile } from './file-drop'
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
  chapterLabels: Record<string, string>
}

/**
 * The import page. Shows the one unfinished job if there is one; otherwise walks the author
 * through file, preview and upload. Earlier jobs are listed below.
 */
export function ImportWizard({ workId, canEdit, jobs, chapterLabels }: ImportWizardProps) {
  const router = useRouter()
  const [current, setCurrent] = useState<ImportJobSnapshot | null>(() => {
    const active = jobs.find((job) => ACTIVE_STATUSES.includes(job.status))
    return active ? toSnapshot(active) : null
  })
  const [step, setStep] = useState<Step>('file')
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [uploadedTitles, setUploadedTitles] = useState<{ jobId: string; titles: string[] } | null>(
    null,
  )
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
    setUploadedTitles({
      jobId: job.id,
      titles: drafts.map(({ title }) => stripEpisodePrefix(title) || title.trim()),
    })
    finishUpload(toSnapshot(started ?? job))
  }

  function finishUpload(snapshot: ImportJobSnapshot) {
    setPreview(null)
    setSelectedFile(null)
    setStep('file')
    setCurrent(snapshot)
    router.refresh()
  }

  const currentJob = current && jobs.find((job) => job.id === current.id)
  const uploadTitles = uploadedTitles?.jobId === current?.id ? uploadedTitles?.titles : undefined
  const currentLabels = currentJob?.chapterIds.length
    ? currentJob.chapterIds.map((id, index) => chapterLabels[id] ?? uploadTitles?.[index])
    : uploadTitles

  return (
    <div className="wg-import-content grid gap-6">
      {current ? (
        <ImportProgress
          key={current.id}
          workId={workId}
          initial={current}
          canEdit={canEdit}
          chapterLabels={currentLabels}
          onClose={() => setCurrent(null)}
        />
      ) : canEdit ? (
        <ImportStages stage={step === 'file' && !splitting ? 1 : 2}>
          <div className="grid min-w-0 gap-3">
            {step === 'file' && !splitting && (
              <FileDrop onSelect={setSelectedFile} onParsed={handleParsed} />
            )}
            {selectedFile && (splitting || step !== 'file') && <FileDetails file={selectedFile} />}
            {splitting && (
              <p role="status" className="wg-import-write text-sm text-muted-ink">
                회차를 나누고 있어요.
              </p>
            )}

            {step === 'preview' && preview && (
              <>
                <p className="wg-import-write text-sm text-muted-ink">
                  가져온 회차는 기존 회차 뒤에 완료 상태로 추가돼요.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={alreadyPublished} onCheckedChange={setAlreadyPublished} />
                  이미 연재한 원고예요 (비축분에서 제외)
                </label>
                <SplitPreview
                  method={preview.method}
                  initial={preview.chapters}
                  onBack={() => {
                    setPreview(null)
                    setSelectedFile(null)
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
                  className="wg-import-write font-mono text-sm"
                >{`${uploaded}/${uploadTotal}화 올리는 중`}</p>
                <ImportMeter completed={uploaded} total={uploadTotal} label="파일 올리기 진행률" />
              </div>
            )}
          </div>
        </ImportStages>
      ) : (
        <Sheet ruled>
          <p className="wg-import-write text-sm text-muted-foreground">
            편집자 이상만 원고를 가져올 수 있어요.
          </p>
        </Sheet>
      )}

      {!current && jobs.length > 0 && (
        <section aria-label="가져오기 기록" className="grid gap-3">
          <h2 className="b-subhead">가져오기 기록</h2>
          <ul className="wg-import-rows">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="wg-import-row flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div className="grid min-w-0 gap-0.5 wrap-anywhere">
                  <span className="font-mono">{job.fileName}</span>
                  <span className="font-mono text-muted-foreground">
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
