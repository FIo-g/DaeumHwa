import { PageEdge } from '@/components/app/page-header'
import { GridTitle, Sheet } from '@/components/motion'
import { unavailableInviteMessage } from '@/components/invite/invite-notice'
import { AcceptInvite } from '@/components/invite/accept-invite'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getInviteByToken } from '@/server/members'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { db } = await pageContext(`/invite/${encodeURIComponent(token)}`)
  const invite = await guardPage(() => getInviteByToken(db, token))

  return (
    <div className="wg-auth-main">
      <Sheet className="b-wrap wg-auth-sheet" aria-labelledby="wg-auth-invite-title">
        <PageEdge className="wg-sheet-edge" showPageMark={false} />
        <div className="wg-auth-columns">
          <GridTitle as="h1" size="page" columns={5} id="wg-auth-invite-title">
            작품 초대
          </GridTitle>
          <div className="wg-auth-body">
            {invite?.usable ? (
              <AcceptInvite
                token={token}
                inviterName={invite.inviterName}
                workTitle={invite.workTitle}
                role={invite.invite.role}
              />
            ) : (
              <p className="b-lede wg-auth-written-line">{unavailableInviteMessage}</p>
            )}
          </div>
        </div>
      </Sheet>
    </div>
  )
}
