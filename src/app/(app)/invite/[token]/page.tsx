import { EmptyState } from '@/components/app/empty-state'
import { PageHeader } from '@/components/app/page-header'
import { AcceptInvite } from '@/components/invite/accept-invite'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getInviteByToken } from '@/server/members'

// Invite acceptance (F16). The user is signed in by the (app) layout; the token is the credential.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { db } = await pageContext(`/invite/${encodeURIComponent(token)}`)
  const invite = await guardPage(() => getInviteByToken(db, token))

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <PageHeader title="작품 초대" />
      {invite?.usable ? (
        <AcceptInvite
          token={token}
          inviterName={invite.inviterName}
          workTitle={invite.workTitle}
          role={invite.invite.role}
        />
      ) : (
        <EmptyState title="만료되었거나 사용할 수 없는 초대입니다." />
      )}
    </div>
  )
}
