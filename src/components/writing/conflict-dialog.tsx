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

type ConflictDialogProps = {
  open: boolean
  pending: boolean
  onLoadServer(): void
  onOverwrite(): void
}

/** Shown when the server copy changed under this editor. The author picks which copy stays. */
export function ConflictDialog({ open, pending, onLoadServer, onOverwrite }: ConflictDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>다른 곳에서 먼저 수정한 원고가 있어요.</DialogTitle>
          <DialogDescription>
            서버 원고를 불러오는 경우 이 기기의 수정 내용은 사라져요. 내 원고로 덮어써도 이전 서버
            원고는 버전 이력에 남아요.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onLoadServer} disabled={pending}>
            서버 원고 불러오기
          </Button>
          <Button onClick={onOverwrite} disabled={pending}>
            내 원고로 덮어쓰기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
