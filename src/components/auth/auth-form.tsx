'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { type AuthMode, authErrorMessage } from './auth-utils'

type AuthFormProps = {
  mode: AuthMode
  /** Validated same-origin path to return to after sign in. */
  next: string | undefined
}

export function AuthForm({ mode, next }: AuthFormProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSignup = mode === 'signup'
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : ''

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    setPending(true)
    setError(null)
    try {
      const result = isSignup
        ? await authClient.signUp.email({ name: String(form.get('name') ?? ''), email, password })
        : await authClient.signIn.email({ email, password })
      if (result.error) {
        setError(authErrorMessage(mode, result.error))
        return
      }
      router.replace(next ?? '/works')
      router.refresh()
    } catch {
      setError(authErrorMessage(mode, null))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {isSignup && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">이름</Label>
            <Input id="name" name="name" autoComplete="name" required />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">이메일</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            minLength={isSignup ? 8 : undefined}
            required
          />
          {isSignup && <p className="text-xs text-muted-foreground">8자 이상 입력해 주세요.</p>}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {isSignup ? '가입하기' : '로그인'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {isSignup ? (
          <Link href={`/login${nextQuery}`} className="underline underline-offset-4">
            이미 계정이 있나요? 로그인
          </Link>
        ) : (
          <Link href={`/signup${nextQuery}`} className="underline underline-offset-4">
            계정이 없나요? 가입하기
          </Link>
        )}
      </p>
    </div>
  )
}
