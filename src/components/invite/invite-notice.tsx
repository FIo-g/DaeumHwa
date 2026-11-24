import { getDb } from '@/db/client'
import { getInviteByToken } from '@/server/members'

export const unavailableInviteMessage = '만료되었거나 사용할 수 없는 초대예요.'

export async function InviteNotice({ next }: { next?: string }) {
  const path = next?.split(/[?#]/, 1)[0]
  const match = path?.match(/^\/invite\/([^/]+)\/?$/)
  if (!match) return null

  let token: string | undefined
  try {
    token = decodeURIComponent(match[1])
  } catch {
    // A malformed URL cannot identify an invite token.
  }

  const invite = token && (await getInviteByToken(getDb(), token))
  if (invite && invite.usable) return null

  return <p className="b-label wg-auth-error wg-auth-invite-notice">{unavailableInviteMessage}</p>
}
