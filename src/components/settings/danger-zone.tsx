'use client'

import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/app/confirm-button'
import { runAction } from '@/lib/client/run-action'
import { setWorkArchivedAction } from '@/server/actions/works'

type DangerZoneProps = {
  workId: string
  archived: boolean
}

/** Archive or restore the work. Owner only; archived works leave the default list. */
export function DangerZone({ workId, archived }: DangerZoneProps) {
  const router = useRouter()

  async function setArchived(next: boolean) {
    const saved = await runAction(setWorkArchivedAction({ workId, archived: next }), {
      success: next ? '작품을 보관했어요.' : '보관을 해제했어요.',
    })
    if (saved) router.refresh()
  }

  return (
    <section className="b-tools-paper b-tools-danger flex max-w-xl flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">보관</h2>
        <p className="text-sm text-muted-foreground">
          {archived
            ? '보관된 작품이에요.'
            : '보관한 작품은 목록에서 빠져요. 원고와 설정은 나중에 다시 열 수 있어요.'}
        </p>
      </div>
      <div>
        {archived ? (
          <ConfirmButton
            title="보관을 해제할까요?"
            description="작품 목록에 다시 보여요."
            confirmLabel="보관 해제"
            onConfirm={() => setArchived(false)}
          >
            보관 해제
          </ConfirmButton>
        ) : (
          <ConfirmButton
            title="작품을 보관할까요?"
            description="나중에 보관을 해제할 수 있어요."
            confirmLabel="보관"
            onConfirm={() => setArchived(true)}
          >
            작품 보관
          </ConfirmButton>
        )}
      </div>
    </section>
  )
}
