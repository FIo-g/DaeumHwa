'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useRef, useState } from 'react'
import { PopButton } from '@/components/motion'
import { TrialButton } from '@/components/auth/trial-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { useAuthEmail } from './auth-email'
import { AuthProgress } from './auth-progress'
import { type AuthMode, authErrorMessage } from './auth-utils'

type AuthFormProps = {
  mode: AuthMode
  trial?: boolean
  next: string | undefined
}

const loginFields = ['email', 'password'] as const
const signupFields = ['name', ...loginFields] as const
type Field = (typeof signupFields)[number]

const labels: Record<Field, string> = { name: '이름', email: '이메일', password: '비밀번호' }
const required: Record<Field, string> = {
  name: '이름을 입력해 주세요.',
  email: '이메일을 입력해 주세요.',
  password: '비밀번호를 입력해 주세요.',
}
const passwordHint = '8자 이상 입력해 주세요.'

function validationMessage(field: Field, input: HTMLInputElement, signup: boolean) {
  if (input.validity.valueMissing) return required[field]
  if (input.validity.typeMismatch) return '이메일 주소를 확인해 주세요.'
  if (field === 'password' && signup && input.value.length < 8) return passwordHint
  return undefined
}

export function AuthForm({ mode, next, trial }: AuthFormProps) {
  const router = useRouter()
  const [email, setEmail] = useAuthEmail()
  const emailInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ text: string; fields: readonly Field[] } | null>(null)
  const [invalid, setInvalid] = useState<Partial<Record<Field, string>>>({})
  const isSignup = mode === 'signup'
  const submitLabel = isSignup ? '가입하기' : '로그인'
  const fields = isSignup ? signupFields : loginFields
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : ''

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const errors: Partial<Record<Field, string>> = {}
    let firstInvalid: HTMLInputElement | undefined
    for (const field of fields) {
      const input = form.elements.namedItem(field) as HTMLInputElement
      const message = validationMessage(field, input, isSignup)
      if (message) {
        errors[field] = message
        firstInvalid ??= input
      }
    }
    setInvalid(errors)
    setError(null)
    if (firstInvalid) {
      firstInvalid.focus()
      return
    }

    const data = new FormData(form)
    const credentials = {
      email: String(data.get('email') ?? ''),
      password: String(data.get('password') ?? ''),
    }
    setPending(true)
    try {
      const result = isSignup
        ? await authClient.signUp.email({ ...credentials, name: String(data.get('name') ?? '') })
        : await authClient.signIn.email(credentials)
      if (result.error) {
        const code = result.error.code
        const linkedFields: Field[] = []
        if (code === 'INVALID_EMAIL_OR_PASSWORD') linkedFields.push(...loginFields)
        if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
          linkedFields.push('email')
        }
        setError({ text: authErrorMessage(mode, result.error), fields: linkedFields })
        return
      }
      router.replace(next ?? '/works')
      router.refresh()
    } catch {
      setError({ text: authErrorMessage(mode, null), fields: [] })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <nav className="wg-auth-menu" aria-label="계정 메뉴">
        {(['login', 'signup'] as const).map((destination) => {
          const label = destination === 'signup' ? '가입' : '로그인'
          return destination === mode ? (
            <span key={destination} className="wg-auth-menu-item" aria-current="page">
              {label}
            </span>
          ) : (
            <Link
              key={destination}
              href={`/${destination}${nextQuery}`}
              onNavigate={() => {
                if (emailInput.current) setEmail(emailInput.current.value)
              }}
              aria-label={
                destination === 'signup' ? '계정이 없나요? 가입하기' : '이미 계정이 있나요? 로그인'
              }
              className="wg-auth-menu-item"
            >
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
      {trial && (
        <p className="b-label b-muted wg-auth-written-line">체험 작품은 이 계정으로 옮겨 드려요.</p>
      )}
      <form
        method="post"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col items-start gap-4"
      >
        {fields.map((field) => {
          const hint = field === 'password' && isSignup
          const localError = invalid[field]
          const linked = error?.fields.includes(field)
          const description = [
            hint && !localError && 'password-hint',
            localError && `${field}-error`,
            linked && 'auth-error',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <div key={field} className="wg-auth-field flex w-full min-w-0 flex-col gap-1">
              <Label htmlFor={field} className="wg-auth-written-line">
                {labels[field]}
              </Label>
              <div className="wg-auth-input-rule">
                <Input
                  ref={field === 'email' ? emailInput : undefined}
                  id={field}
                  name={field}
                  type={field === 'name' ? 'text' : field}
                  autoComplete={
                    field === 'password' ? (isSignup ? 'new-password' : 'current-password') : field
                  }
                  value={field === 'email' ? email : undefined}
                  onChange={(event) => {
                    if (field === 'email') setEmail(event.currentTarget.value)
                    if (localError) setInvalid((previous) => ({ ...previous, [field]: undefined }))
                    if (error) setError(null)
                  }}
                  minLength={hint ? 8 : undefined}
                  aria-invalid={Boolean(localError || linked) || undefined}
                  aria-describedby={description || undefined}
                  required
                />
              </div>
              {hint && !localError && (
                <p className="b-label b-muted wg-auth-written-line" id="password-hint">
                  {passwordHint}
                </p>
              )}
              {localError && (
                <p className="b-label wg-auth-error" id={`${field}-error`}>
                  {localError}
                </p>
              )}
            </div>
          )
        })}
        {error && (
          <p role="alert" id="auth-error" className="b-label wg-auth-error">
            {error.text}
          </p>
        )}
        <PopButton
          type="submit"
          pending={pending}
          pendingLabel={submitLabel}
          size="large"
          className="wg-auth-action"
          arrow={pending ? <AuthProgress /> : undefined}
        >
          {submitLabel}
        </PopButton>
      </form>
      {!trial && <TrialButton variant="outline" className="self-start" />}
    </div>
  )
}
