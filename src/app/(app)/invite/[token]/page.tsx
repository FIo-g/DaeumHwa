import '@/app/styles/b-landing.css'
import { ColorBand, Reveal } from '@/components/motion'
import { AcceptInvite } from '@/components/invite/accept-invite'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getInviteByToken } from '@/server/members'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { db } = await pageContext(`/invite/${encodeURIComponent(token)}`)
  const invite = await guardPage(() => getInviteByToken(db, token))

  return (
    <ColorBand color="leaf" className="b-landing-invite" aria-labelledby="b-landing-invite-title">
      <div className="b-paper mx-auto max-w-2xl space-y-4 bg-paper">
        <Reveal>
          <h1 id="b-landing-invite-title" className="b-heading">
            작품 초대
          </h1>
        </Reveal>
        {invite?.usable ? (
          <AcceptInvite
            token={token}
            inviterName={invite.inviterName}
            workTitle={invite.workTitle}
            role={invite.invite.role}
          />
        ) : (
          <p>만료되었거나 사용할 수 없는 초대예요.</p>
        )}
      </div>
    </ColorBand>
  )
}
