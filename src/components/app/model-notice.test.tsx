// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ModelNotice } from './model-notice'

const ENV_KEYS = [
  'AI_PROVIDER',
  'ANTHROPIC_API_KEY',
  'OPENCODE_API_KEY',
  'OPENCODE_MODEL',
  'OPENCODE_MODEL_IMPORT',
  'ANTHROPIC_MODEL',
] as const
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

const NOTICE = '모델 학습에 쓰일 수 있습니다'

describe('ModelNotice', () => {
  it('warns when the OpenCode default model is a Contributor model', () => {
    process.env.AI_PROVIDER = 'opencode'
    process.env.OPENCODE_API_KEY = 'oc-key'
    process.env.OPENCODE_MODEL = 'muse-spark-1.3-contributor'
    render(<ModelNotice />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(
      '현재 AI 모델(muse-spark-1.3-contributor)은 보낸 원고와 설정이 모델 학습에 쓰일 수 있습니다. 공개 전 원고라면 다른 모델을 쓰세요.',
    )
  })

  it('warns when only the import model is a Contributor model', () => {
    process.env.AI_PROVIDER = 'opencode'
    process.env.OPENCODE_API_KEY = 'oc-key'
    process.env.OPENCODE_MODEL_IMPORT = 'muse-spark-1.2-contributor'
    render(<ModelNotice />)
    expect(screen.getByRole('status')).toHaveTextContent('muse-spark-1.2-contributor')
    expect(screen.getByRole('status')).toHaveTextContent(NOTICE)
  })

  it('renders nothing for the default Claude model', () => {
    process.env.AI_PROVIDER = 'opencode'
    process.env.OPENCODE_API_KEY = 'oc-key'
    const { container } = render(<ModelNotice />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for non-training Responses models', () => {
    process.env.AI_PROVIDER = 'opencode'
    process.env.OPENCODE_API_KEY = 'oc-key'
    process.env.OPENCODE_MODEL = 'gpt-6-luna'
    process.env.OPENCODE_MODEL_IMPORT = 'grok-4.7'
    const { container } = render(<ModelNotice />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the Anthropic provider is used, even with a Contributor model name', () => {
    process.env.AI_PROVIDER = 'anthropic'
    process.env.ANTHROPIC_API_KEY = 'a-key'
    process.env.ANTHROPIC_MODEL = 'muse-spark-1.3-contributor'
    const { container } = render(<ModelNotice />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing in demo mode', () => {
    process.env.AI_PROVIDER = 'fake'
    process.env.OPENCODE_MODEL = 'muse-spark-1.3-contributor'
    const { container } = render(<ModelNotice />)
    expect(container).toBeEmptyDOMElement()
  })
})
