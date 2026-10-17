// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoBanner } from './demo-banner'

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

describe('DemoBanner', () => {
  it('shows the demo notice when AI_PROVIDER is fake', () => {
    process.env.AI_PROVIDER = 'fake'
    render(<DemoBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('AI 데모 모드')
  })

  it('names both API keys when no key is configured', () => {
    render(<DemoBanner />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('ANTHROPIC_API_KEY 또는 OPENCODE_API_KEY')
  })

  it('renders nothing when an Anthropic key is configured', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { container } = render(<DemoBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when only an OpenCode key is configured', () => {
    process.env.OPENCODE_API_KEY = 'oc-key'
    const { container } = render(<DemoBanner />)
    expect(container).toBeEmptyDOMElement()
  })
})
