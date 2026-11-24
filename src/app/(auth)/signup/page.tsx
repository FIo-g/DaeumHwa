import { AuthForm } from '@/components/auth/auth-form'
import { safeNextPath } from '@/components/auth/auth-utils'
import { getSessionUser } from '@/server/session'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  const user = await getSessionUser()
  return <AuthForm mode="signup" next={safeNextPath(next)} trial={user?.isAnonymous} />
}
