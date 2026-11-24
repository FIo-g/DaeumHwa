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
import { SettingsSection } from './settings-section'

export type MemberView = {
  userId: string
  name: string
  email: string
  role: Role
}

type MembersPanelProps = {
  workId: string
  viewerRole: Role
  trial?: boolean
  currentUserId: string
  members: MemberView[]
}

type InvitableRole = Exclude<Role, 'owner'>

const INVITABLE_ROLES: InvitableRole[] = ['editor', 'commenter', 'viewer']

/** Members of the work. The owner changes roles and removes members; anyone can leave. */
export function MembersPanel({
  workId,
  viewerRole,
  currentUserId,
  members,
  trial,
}: MembersPanelProps) {
  const router = useRouter()
  const isOwner = viewerRole === 'owner'

  async function changeRole(member: MemberView, role: InvitableRole) {
    const saved = await runAction(changeMemberRoleAction({ workId, userId: member.userId, role }), {
      success: `${member.name}님의 역할을 바꿨어요.`,
    })
    if (saved !== null) router.refresh()
  }

  async function removeMember(member: MemberView) {
    const saved = await runAction(removeMemberAction({ workId, userId: member.userId }), {
      success: `${member.name}님을 내보냈어요.`,
    })
    if (saved !== null) router.refresh()
  }

  async function leaveWork() {
    const saved = await runAction(removeMemberAction({ workId, userId: currentUserId }), {
      success: '작품에서 나갔어요.',
    })
    if (saved !== null) router.push('/works')
  }

  return (
    <SettingsSection title="팀 관리" lead={<h2>구성원</h2>}>
      <ul className="wg-settings-list">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId
          const isMemberOwner = member.role === 'owner'
          return (
            <li key={member.userId}>
              <div className="b-row wg-settings-row wg-settings-record">
                <div className="wg-settings-write grid min-w-0 gap-1 wrap-anywhere">
                  <span className="b-row__title">
                    {member.name}
                    {isSelf && <span className="ml-1 text-xs text-muted-ink">(나)</span>}
                  </span>
                  {member.email && <span className="text-sm text-muted-ink">{member.email}</span>}
                </div>
                <div className="wg-settings-row-actions">
                  {isOwner && !isMemberOwner ? (
                    <Select
                      value={member.role}
                      onValueChange={(next) => {
                        if (next && next !== member.role) {
                          void changeRole(member, next as InvitableRole)
                        }
                      }}
                    >
                      <SelectTrigger
                        aria-label={`${member.name} 역할`}
                        size="sm"
                        className="min-w-28"
                      >
                        <SelectValue>
                          {(selected: string | null) =>
                            ROLE_LABEL[(selected ?? member.role) as Role]
                          }
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
                    <span className="wg-settings-role wg-settings-write">
                      {ROLE_LABEL[member.role]}
                    </span>
                  )}
                  {isOwner && !isMemberOwner && (
                    <ConfirmButton
                      title={`${member.name}님을 내보낼까요?`}
                      description="내보낸 구성원은 이 작품을 더 볼 수 없어요."
                      confirmLabel="내보내기"
                      onConfirm={() => removeMember(member)}
                      size="sm"
                    >
                      내보내기
                    </ConfirmButton>
                  )}
                  {isSelf && !isOwner && !trial && (
                    <ConfirmButton
                      title="작품에서 나갈까요?"
                      description="작품에서 나가는 즉시 접근 권한이 끝나요. 다시 들어올 때는 초대 링크가 필요해요."
                      confirmLabel="나가기"
                      onConfirm={leaveWork}
                      size="sm"
                    >
                      작품에서 나가기
                    </ConfirmButton>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </SettingsSection>
  )
}
