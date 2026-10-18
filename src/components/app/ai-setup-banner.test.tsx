// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AiSetupBanner } from './ai-setup-banner'

const ENV_KEYS = ['AI_PROVIDER', 'ANTHROPIC_API_KEY', 'OPENCODE_API_KEY'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  cleanup()
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('AiSetupBanner', () => {
  it('names both API keys when no key is configured', () => {
    render(<AiSetupBanner />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(
      'AI 키가 설정되지 않았습니다. ANTHROPIC_API_KEY 또는 OPENCODE_API_KEY를 설정하면 AI 기능을 쓸 수 있습니다.',
    )
  })

  it('shows the notice when AI_PROVIDER is fake and no key is set', () => {
    process.env.AI_PROVIDER = 'fake'
    render(<AiSetupBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('AI 키가 설정되지 않았습니다')
  })

  it('renders nothing when an Anthropic key is configured', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { container } = render(<AiSetupBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when only an OpenCode key is configured', () => {
    process.env.OPENCODE_API_KEY = 'oc-key'
    const { container } = render(<AiSetupBanner />)
    expect(container).toBeEmptyDOMElement()
  })
})
