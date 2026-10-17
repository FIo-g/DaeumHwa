'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatKoreanDateTime } from '@/lib/dates'

type RecoveryDialogProps = {
  open: boolean
  savedAt: number | null
  /** True when the server copy changed after this device saved its draft. */
  stale?: boolean
  onRecover(): void
  onDiscard(): void
}

/** Offered when this device holds an edit that differs from the server copy. */
export function RecoveryDialog({
  open,
  savedAt,
  stale = false,
  onRecover,
  onDiscard,
}: RecoveryDialogProps) {
  const when = savedAt !== null ? `${formatKoreanDateTime(new Date(savedAt))}에 ` : ''

  if (stale) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              다른 곳에서 수정된 원고가 있어, 이 기기의 임시 저장본과 다릅니다.
            </DialogTitle>
            <DialogDescription>
              이 기기에는 {when}임시 저장된 원고가 있습니다. 복구하면 현재 서버 원고가 이 원고로
              바뀝니다. 이전 원고는 버전 이력에 남습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onDiscard}>
              서버 원고 유지
            </Button>
            <Button onClick={onRecover}>이 기기 원고로 복구</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>저장되지 않은 변경이 있습니다. 복구할까요?</DialogTitle>
          <DialogDescription>
            {savedAt !== null
              ? `${formatKoreanDateTime(new Date(savedAt))}에 이 기기에 임시 저장된 원고입니다.`
              : '이 기기에 임시 저장된 원고입니다.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onDiscard}>
            버리기
          </Button>
          <Button onClick={onRecover}>복구</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
