'use client'

import { Download, Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { ExportPayload } from '@/db/types'
import { backupFileName } from '@/lib/backup'
import { Button } from '@/components/ui/button'
import { getTextWorker } from '@/lib/client/worker-client'
import { seoulToday } from '@/lib/dates'

const FALLBACK_MESSAGE = '백업 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.'

type ExportButtonProps = {
  workId: string
  title: string
}

function errorMessageOf(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error
  }
  return FALLBACK_MESSAGE
}

/** Owner-only whole-work backup: fetches the export JSON, zips it in the worker, downloads the file. */
export function ExportButton({ workId, title }: ExportButtonProps) {
  const [busy, setBusy] = useState(false)

  async function exportWork() {
    setBusy(true)
    try {
      const response = await fetch(`/api/works/${workId}/export`, { cache: 'no-store' })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(errorMessageOf(body))
        return
      }
      const zip = await getTextWorker().buildBackupZip(body as ExportPayload)
      const url = URL.createObjectURL(new Blob([new Uint8Array(zip)], { type: 'application/zip' }))
      const link = document.createElement('a')
      link.href = url
      link.download = backupFileName(title, seoulToday())
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      toast.error(FALLBACK_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={exportWork} disabled={busy}>
        {busy ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : (
          <Download aria-hidden="true" />
        )}
        내보내기
      </Button>
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          백업 파일 만드는 중…
        </p>
      )}
    </div>
  )
}
