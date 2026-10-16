// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { clearDraft, getDraft, getKv, saveDraft, setKv } from '@/lib/client/local-store'

describe('local-store', () => {
  it('saves, reads and clears a draft', async () => {
    await saveDraft('chapter-1', { title: '1화', body: '본문', savedAt: 1, baseVersion: 3 })
    expect(await getDraft('chapter-1')).toEqual({
      title: '1화',
      body: '본문',
      savedAt: 1,
      baseVersion: 3,
    })
    await clearDraft('chapter-1')
    expect(await getDraft('chapter-1')).toBeUndefined()
  })

  it('stores key-value entries', async () => {
    await setKv('last-tab', { tab: 'wiki' })
    expect(await getKv<{ tab: string }>('last-tab')).toEqual({ tab: 'wiki' })
    expect(await getKv('missing-key')).toBeUndefined()
  })
})
