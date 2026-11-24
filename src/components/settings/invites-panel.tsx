'use client'

import { CheckIcon } from 'lucide-react'
import { PopButton } from '@/components/motion'
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

/** Invite links for the owner: create (role, 7 days), copy and cancel. */
export function InvitesPanel({ workId, invites }: InvitesPanelProps) {
  const router = useRouter()
  const [role, setRole] = useState<InvitableRole>('editor')
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<InviteView | null>(null)

  const [copied, setCopied] = useState<{
    id: string
    from: 'created' | 'list'
    sequence: number
  } | null>(null)

  async function copyLink(invite: InviteView, from: 'created' | 'list') {
    try {
      await navigator.clipboard.writeText(inviteUrl(invite.token))
      setCopied((last) => ({ id: invite.id, from, sequence: (last?.sequence ?? 0) + 1 }))
      toast.success('초대 링크를 복사했어요.')
    } catch {
      setCopied(null)
      toast.error('링크를 복사하지 못했어요.')
    }
  }

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
      success: '초대를 취소했어요.',
    })
    if (saved !== null) {
      if (created?.id === invite.id) setCreated(null)
      if (copied?.id === invite.id) setCopied(null)
      router.refresh()
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">초대</h2>
        <p className="text-sm text-muted-foreground">
          초대받은 사람은 로그인한 뒤 작품에 참여해요. 링크는 한 번만 쓸 수 있어요. 7일 뒤 만료돼요.
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
        <PopButton onClick={createInvite} pending={pending}>
          초대 링크 만들기
        </PopButton>
      </div>

      {created && (
        <div className="b-tools-paper grid gap-2 bg-sand/35">
          <p className="text-sm font-medium">
            {ROLE_LABEL[created.role]} 초대 링크 · 만료 {formatKoreanDateTime(created.expiresAt)}
          </p>
          <p className="font-mono text-sm break-all">{inviteUrl(created.token)}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => copyLink(created, 'created')}>
              링크 복사
            </Button>
            {copied?.id === created.id && copied.from === 'created' && (
              <CopyConfirmation key={copied.sequence} />
            )}
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <ul className="flex flex-col divide-y rounded-xl border">
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="b-tools-index-row flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-sm">
                {ROLE_LABEL[invite.role]} · 만료 {formatKoreanDateTime(invite.expiresAt)}
              </span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => copyLink(invite, 'list')}>
                  링크 복사
                </Button>
                {copied?.id === invite.id && copied.from === 'list' && (
                  <CopyConfirmation key={copied.sequence} />
                )}
                <ConfirmButton
                  title="이 초대를 취소할까요?"
                  description="취소한 링크는 다시 쓸 수 없어요."
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

function CopyConfirmation() {
  return (
    <span role="status" className="b-tools-copy">
      <CheckIcon aria-hidden="true" />
      복사했어요
    </span>
  )
}
