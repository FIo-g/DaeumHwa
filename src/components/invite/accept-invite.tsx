'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PopButton } from '@/components/motion'
import type { Role } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { hasJongseong } from '@/lib/korean/josa'
import { ROLE_LABEL } from '@/lib/labels'
import { acceptInviteAction } from '@/server/actions/members'

type AcceptInviteProps = {
  token: string
  inviterName: string
  workTitle: string
  role: Role
}

/** Shows who invited the user to which work, and joins on request. */
export function AcceptInvite({ token, inviterName, workTitle, role }: AcceptInviteProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const roleLabel = ROLE_LABEL[role]
  const particle = hasJongseong(roleLabel.charAt(roleLabel.length - 1)) ? '으로' : '로'

  async function join() {
    setPending(true)
    try {
      const result = await runAction(acceptInviteAction({ token }), {
        success: '작품에 참여했어요.',
      })
      if (result) router.push(`/works/${result.workId}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-5">
      <p className="b-lede wrap-anywhere">
        {`${inviterName}님이 '${workTitle}' 작품에 `}
        <span className="whitespace-nowrap">{`${roleLabel}${particle} 초대했어요.`}</span>
      </p>
      <PopButton onClick={join} pending={pending}>
        참여하기
      </PopButton>
    </div>
  )
}
