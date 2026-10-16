// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authClient } from '@/lib/auth-client'
import { AuthForm } from './auth-form'

const routerMock = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
  },
}))

const signIn = vi.mocked(authClient.signIn.email)
const signUp = vi.mocked(authClient.signUp.email)

async function fillAndSubmit(
  submitLabel: string,
  values: { name?: string; email: string; password: string },
) {
  if (values.name !== undefined) {
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: values.name } })
  }
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: values.email } })
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: values.password } })
  fireEvent.click(screen.getByRole('button', { name: submitLabel }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('AuthForm login mode', () => {
  it('shows email and password without the name field, with a link to signup', () => {
    render(<AuthForm mode="login" next={undefined} />)
    expect(screen.getByLabelText('이메일')).toBeInTheDocument()
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument()
    expect(screen.queryByLabelText('이름')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '계정이 없나요? 가입하기' })).toHaveAttribute(
      'href',
      '/signup',
    )
  })

  it('shows the wrong-credentials message and does not navigate', async () => {
    signIn.mockResolvedValue({
      data: null,
      error: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid', status: 401 },
    } as never)
    render(<AuthForm mode="login" next={undefined} />)
    await fillAndSubmit('로그인', { email: 'a@test.local', password: 'password123' })
    expect(await screen.findByText('이메일 또는 비밀번호가 맞지 않습니다.')).toBeInTheDocument()
    expect(routerMock.replace).not.toHaveBeenCalled()
  })

  it('goes to /works after a successful sign in', async () => {
    signIn.mockResolvedValue({ data: { user: {} }, error: null } as never)
    render(<AuthForm mode="login" next={undefined} />)
    await fillAndSubmit('로그인', { email: 'a@test.local', password: 'password123' })
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/works'))
    expect(routerMock.refresh).toHaveBeenCalled()
    expect(signIn).toHaveBeenCalledWith({ email: 'a@test.local', password: 'password123' })
  })

  it('returns to the requested path after sign in', async () => {
    signIn.mockResolvedValue({ data: { user: {} }, error: null } as never)
    render(<AuthForm mode="login" next="/works/w1/chapters" />)
    await fillAndSubmit('로그인', { email: 'a@test.local', password: 'password123' })
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/works/w1/chapters'))
  })

  it('shows the generic message when the request throws', async () => {
    signIn.mockRejectedValue(new Error('network'))
    render(<AuthForm mode="login" next={undefined} />)
    await fillAndSubmit('로그인', { email: 'a@test.local', password: 'password123' })
    expect(await screen.findByText('잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
  })
})

describe('AuthForm signup mode', () => {
  it('shows the name field and a link back to login', () => {
    render(<AuthForm mode="signup" next={undefined} />)
    expect(screen.getByLabelText('이름')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '이미 계정이 있나요? 로그인' })).toHaveAttribute(
      'href',
      '/login',
    )
  })

  it('shows the duplicate email message', async () => {
    signUp.mockResolvedValue({
      data: null,
      error: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'exists', status: 422 },
    } as never)
    render(<AuthForm mode="signup" next={undefined} />)
    await fillAndSubmit('가입하기', {
      name: '테스트',
      email: 'a@test.local',
      password: 'password123',
    })
    expect(await screen.findByText('이미 가입된 이메일입니다.')).toBeInTheDocument()
    expect(routerMock.replace).not.toHaveBeenCalled()
  })

  it('creates the account and goes to /works', async () => {
    signUp.mockResolvedValue({ data: { user: {} }, error: null } as never)
    render(<AuthForm mode="signup" next={undefined} />)
    await fillAndSubmit('가입하기', {
      name: '테스트',
      email: 'a@test.local',
      password: 'password123',
    })
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/works'))
    expect(signUp).toHaveBeenCalledWith({
      name: '테스트',
      email: 'a@test.local',
      password: 'password123',
    })
  })
})
