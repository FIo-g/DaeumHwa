'use client'

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
import { SettingsSection } from './settings-section'

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

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const visibleInvites = created
    ? [created, ...invites.filter((invite) => invite.id !== created.id)]
    : invites

  async function copyLink(invite: InviteView) {
    try {
      await navigator.clipboard.writeText(inviteUrl(invite.token))
      setCopiedId(invite.id)
      toast.success('초대 링크를 복사했어요.')
    } catch {
      setCopiedId(null)
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
      if (copiedId === invite.id) setCopiedId(null)
      router.refresh()
    }
  }

  return (
    <SettingsSection
      title="초대 링크"
      lead={
        <>
          <h2>초대</h2>
          <p>
            초대받은 사람은 로그인한 뒤 작품에 참여해요. 링크는 한 번만 쓸 수 있어요. 7일 뒤
            만료돼요.
          </p>
        </>
      }
    >
      <div className="wg-settings-row-actions mb-3">
        <Select value={role} onValueChange={(next) => next && setRole(next as InvitableRole)}>
          <SelectTrigger aria-label="초대할 역할" className="min-w-28">
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

      {visibleInvites.length > 0 && (
        <ul className="wg-settings-list">
          {visibleInvites.map((invite) => {
            const isCreated = created?.id === invite.id
            const copied = copiedId === invite.id
            return (
              <li key={invite.id}>
                <div className="b-row wg-settings-row wg-settings-record">
                  <div className="wg-settings-write grid min-w-0 gap-1">
                    <p>
                      {ROLE_LABEL[invite.role]}
                      {isCreated && ' 초대 링크'} · 만료{' '}
                      <time className="font-mono" dateTime={invite.expiresAt}>
                        {formatKoreanDateTime(invite.expiresAt)}
                      </time>
                    </p>
                    <p className="font-mono text-sm break-all">
                      {isCreated ? inviteUrl(invite.token) : `/invite/${invite.token}`}
                    </p>
                  </div>
                  <div className="wg-settings-row-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-w-24"
                      aria-label="링크 복사"
                      onClick={() => copyLink(invite)}
                    >
                      {copied ? '복사했어요' : '링크 복사'}
                    </Button>
                    {copied && (
                      <span role="status" className="sr-only">
                        복사했어요
                      </span>
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
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </SettingsSection>
  )
}
