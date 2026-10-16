'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmButton } from '@/components/app/confirm-button'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Role } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { formatKoreanDateTime } from '@/lib/dates'
import { ROLE_LABEL } from '@/lib/labels'
import { createInviteAction, revokeInviteAction } from '@/server/actions/members'

export type InviteView = {
  id: string
  role: Role
  token: string
  /** ISO string. */
  expiresAt: string
}

type InvitesPanelProps = {
  workId: string
  invites: InviteView[]
}

type InvitableRole = Exclude<Role, 'owner'>

const INVITABLE_ROLES: InvitableRole[] = ['editor', 'commenter', 'viewer']

function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`
}

async function copyLink(token: string) {
  try {
    await navigator.clipboard.writeText(inviteUrl(token))
    toast.success('초대 링크를 복사했습니다.')
  } catch {
    toast.error('링크를 복사하지 못했습니다. 직접 선택해서 복사해 주세요.')
  }
}

/** Invite links for the owner: create (role, 7 days), copy and cancel. */
export function InvitesPanel({ workId, invites }: InvitesPanelProps) {
  const router = useRouter()
  const [role, setRole] = useState<InvitableRole>('editor')
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<InviteView | null>(null)

  async function createInvite() {
    setPending(true)
    try {
      const invite = await runAction(createInviteAction({ workId, role }))
      if (invite) {
        setCreated({
          id: invite.id,
          role: invite.role,
          token: invite.token,
          expiresAt: new Date(invite.expiresAt).toISOString(),
        })
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  async function revokeInvite(invite: InviteView) {
    const saved = await runAction(revokeInviteAction({ inviteId: invite.id }), {
      success: '초대를 취소했습니다.',
    })
    if (saved !== null) router.refresh()
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">초대</h2>
        <p className="text-sm text-muted-foreground">
          초대 링크를 받은 사람은 로그인한 뒤 이 작품에 참여합니다. 링크는 한 번만 쓸 수 있고 7일 뒤
          만료됩니다.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={role} onValueChange={(next) => next && setRole(next as InvitableRole)}>
          <SelectTrigger aria-label="초대할 역할" className="min-w-36">
            <SelectValue>
              {(selected: string | null) => ROLE_LABEL[(selected ?? role) as Role]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {INVITABLE_ROLES.map((item) => (
              <SelectItem key={item} value={item}>
                {ROLE_LABEL[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={createInvite} disabled={pending}>
          초대 링크 만들기
        </Button>
      </div>

      {created && (
        <div className="flex flex-col gap-2 rounded-xl border p-3">
          <p className="text-sm font-medium">
            {ROLE_LABEL[created.role]} 초대 링크 · 만료 {formatKoreanDateTime(created.expiresAt)}
          </p>
          <p className="font-mono text-sm break-all">{inviteUrl(created.token)}</p>
          <div>
            <Button variant="outline" size="sm" onClick={() => copyLink(created.token)}>
              링크 복사
            </Button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <ul className="flex flex-col divide-y rounded-xl border">
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-sm">
                {ROLE_LABEL[invite.role]} · 만료 {formatKoreanDateTime(invite.expiresAt)}
              </span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => copyLink(invite.token)}>
                  링크 복사
                </Button>
                <ConfirmButton
                  title="이 초대를 취소할까요?"
                  description="취소하면 이 링크로는 더 이상 참여할 수 없습니다."
                  confirmLabel="초대 취소"
                  onConfirm={() => revokeInvite(invite)}
                  size="sm"
                >
                  취소
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
