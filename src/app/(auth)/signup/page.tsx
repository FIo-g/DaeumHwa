import { AuthForm } from '@/components/auth/auth-form'
import { safeNextPath } from '@/components/auth/auth-utils'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  return <AuthForm mode="signup" next={safeNextPath(next)} />
}
