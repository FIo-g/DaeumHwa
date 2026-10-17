import { afterEach, describe, expect, it, vi } from 'vitest'
import { isInngestEnabled } from '@/inngest/client'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isInngestEnabled', () => {
  function setEnv(event: string, dev: string | undefined) {
    vi.stubEnv('INNGEST_EVENT_KEY', event)
    if (dev === undefined) {
      delete process.env.INNGEST_DEV
    } else {
      vi.stubEnv('INNGEST_DEV', dev)
    }
  }

  it('is off with no event key and no dev setting', () => {
    setEnv('', undefined)
    expect(isInngestEnabled()).toBe(false)
  })

  it('is on with an event key', () => {
    setEnv('evt-key', undefined)
    expect(isInngestEnabled()).toBe(true)
  })

  it.each(['1', 'true', 'TRUE', ' true ', '1 '])(
    'is on for INNGEST_DEV=%j, as the SDK reads it',
    (value) => {
      setEnv('', value)
      expect(isInngestEnabled()).toBe(true)
    },
  )

  it.each([
    'http://localhost:8288',
    'https://dev.example.test',
    'localhost:8288',
    '127.0.0.1:8288',
  ])('is on when INNGEST_DEV is a dev server URL: %s', (value) => {
    setEnv('', value)
    expect(isInngestEnabled()).toBe(true)
  })

  it.each(['0', 'false', 'FALSE', 'undefined', ''])(
    'is off for INNGEST_DEV=%j without an event key',
    (value) => {
      setEnv('', value)
      expect(isInngestEnabled()).toBe(false)
    },
  )

  it('stays on for an event key even when INNGEST_DEV is off', () => {
    setEnv('evt-key', '0')
    expect(isInngestEnabled()).toBe(true)
  })
})
