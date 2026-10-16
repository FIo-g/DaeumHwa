import { AuthForm } from '@/components/auth/auth-form'
import { safeNextPath } from '@/components/auth/auth-utils'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  return <AuthForm mode="login" next={safeNextPath(next)} />
}
