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
            <DialogTitle>서버 원고와 이 기기의 임시 저장본이 달라요.</DialogTitle>
            <DialogDescription>
              이 기기에는 {when}임시 저장된 원고가 있어요. 복구는 서버 원고를 이 기기의 원고로
              바꿔요. 이전 원고는 버전 이력에 남아요.
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
          <DialogTitle>저장하지 않은 변경이 있어요. 복구할까요?</DialogTitle>
          <DialogDescription>
            {savedAt !== null
              ? `${formatKoreanDateTime(new Date(savedAt))}에 이 기기에 임시 저장된 원고예요.`
              : '이 기기에 임시 저장된 원고예요.'}
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
