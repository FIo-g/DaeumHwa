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
      success: next ? '작품을 보관했습니다.' : '보관을 해제했습니다.',
    })
    if (saved) router.refresh()
  }

  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-xl border border-destructive/30 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">보관</h2>
        <p className="text-sm text-muted-foreground">
          {archived
            ? '보관된 작품입니다.'
            : '보관하면 작품 목록에서 사라집니다. 원고와 설정은 그대로 남습니다.'}
        </p>
      </div>
      <div>
        {archived ? (
          <ConfirmButton
            title="보관을 해제할까요?"
            description="작품이 다시 작품 목록에 나타납니다."
            confirmLabel="보관 해제"
            onConfirm={() => setArchived(false)}
          >
            보관 해제
          </ConfirmButton>
        ) : (
          <ConfirmButton
            title="작품을 보관할까요?"
            description="나중에 보관을 해제할 수 있습니다."
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
