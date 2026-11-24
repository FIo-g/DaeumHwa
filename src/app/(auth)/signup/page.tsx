import { AuthForm } from '@/components/auth/auth-form'
import { safeNextPath } from '@/components/auth/auth-utils'
import { InviteNotice } from '@/components/invite/invite-notice'
import { getSessionUser } from '@/server/session'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  const user = await getSessionUser()
  const nextPath = safeNextPath(next)
  return (
    <>
      <InviteNotice next={nextPath} />
      <AuthForm mode="signup" next={nextPath} trial={user?.isAnonymous} />
    </>
  )
}
