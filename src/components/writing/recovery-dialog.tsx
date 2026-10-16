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
  onRecover(): void
  onDiscard(): void
}

/** Offered when this device holds an edit that the server does not have. */
export function RecoveryDialog({ open, savedAt, onRecover, onDiscard }: RecoveryDialogProps) {
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
