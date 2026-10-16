// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoBanner } from './demo-banner'

const saved = { AI_PROVIDER: process.env.AI_PROVIDER, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }

beforeEach(() => {
  delete process.env.AI_PROVIDER
  delete process.env.ANTHROPIC_API_KEY
})

afterEach(() => {
  cleanup()
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('DemoBanner', () => {
  it('shows the demo notice when AI_PROVIDER is fake', () => {
    process.env.AI_PROVIDER = 'fake'
    render(<DemoBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('AI 데모 모드')
  })

  it('shows the demo notice when no API key is configured', () => {
    render(<DemoBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('ANTHROPIC_API_KEY')
  })

  it('renders nothing when a real AI provider is configured', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { container } = render(<DemoBanner />)
    expect(container).toBeEmptyDOMElement()
  })
})
