'use client'

import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/app/confirm-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Role } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { ROLE_LABEL } from '@/lib/labels'
import { changeMemberRoleAction, removeMemberAction } from '@/server/actions/members'

export type MemberView = {
  userId: string
  name: string
  email: string
  role: Role
}

type MembersPanelProps = {
  workId: string
  viewerRole: Role
  currentUserId: string
  members: MemberView[]
}

type InvitableRole = Exclude<Role, 'owner'>

const INVITABLE_ROLES: InvitableRole[] = ['editor', 'commenter', 'viewer']

/** Members of the work. The owner changes roles and removes members; anyone can leave. */
export function MembersPanel({ workId, viewerRole, currentUserId, members }: MembersPanelProps) {
  const router = useRouter()
  const isOwner = viewerRole === 'owner'

  async function changeRole(member: MemberView, role: InvitableRole) {
    const saved = await runAction(changeMemberRoleAction({ workId, userId: member.userId, role }), {
      success: `${member.name}님의 역할을 바꿨습니다.`,
    })
    if (saved !== null) router.refresh()
  }

  async function removeMember(member: MemberView) {
    const saved = await runAction(removeMemberAction({ workId, userId: member.userId }), {
      success: `${member.name}님을 내보냈습니다.`,
    })
    if (saved !== null) router.refresh()
  }

  async function leaveWork() {
    const saved = await runAction(removeMemberAction({ workId, userId: currentUserId }), {
      success: '작품에서 나갔습니다.',
    })
    if (saved !== null) router.push('/works')
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">구성원</h2>
      <ul className="flex flex-col divide-y rounded-xl border">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId
          const isMemberOwner = member.role === 'owner'
          return (
            <li
              key={member.userId}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">
                  {member.name}
                  {isSelf && <span className="ml-1 text-xs text-muted-foreground">(나)</span>}
                </span>
                <span className="truncate text-sm text-muted-foreground">{member.email}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isOwner && !isMemberOwner ? (
                  <Select
                    value={member.role}
                    onValueChange={(next) => {
                      if (next && next !== member.role) {
                        void changeRole(member, next as InvitableRole)
                      }
                    }}
                  >
                    <SelectTrigger aria-label={`${member.name} 역할`} className="min-w-36">
                      <SelectValue>
                        {(selected: string | null) => ROLE_LABEL[(selected ?? member.role) as Role]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {INVITABLE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-sm text-muted-foreground">{ROLE_LABEL[member.role]}</span>
                )}
                {isOwner && !isMemberOwner && (
                  <ConfirmButton
                    title={`${member.name}님을 내보낼까요?`}
                    description="내보내면 이 작품을 더 볼 수 없습니다."
                    confirmLabel="내보내기"
                    onConfirm={() => removeMember(member)}
                  >
                    내보내기
                  </ConfirmButton>
                )}
                {isSelf && !isOwner && (
                  <ConfirmButton
                    title="작품에서 나갈까요?"
                    description="나가면 이 작품을 더 볼 수 없습니다. 다시 들어가려면 초대 링크가 필요합니다."
                    confirmLabel="나가기"
                    onConfirm={leaveWork}
                  >
                    작품에서 나가기
                  </ConfirmButton>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
