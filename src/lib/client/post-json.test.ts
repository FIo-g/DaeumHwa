import { afterEach, describe, expect, it, vi } from 'vitest'
import { postAction } from './post-json'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('postAction', () => {
  it('posts the body as JSON and returns the ActionResult', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, data: { count: 2 } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await postAction<{ count: number }>('/api/x', { useAi: false })

    expect(result).toEqual({ ok: true, data: { count: 2 } })
    expect(fetchMock).toHaveBeenCalledWith('/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ useAi: false }),
    })
  })

  it('passes a failed ActionResult through unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ ok: false, error: { code: 'FORBIDDEN', message: '권한이 없습니다.' } }),
      ),
    )
    expect(await postAction('/api/x', {})).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: '권한이 없습니다.' },
    })
  })

  it('turns a network failure into a retry message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const result = await postAction('/api/x', {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('잠시 후 다시 시도해 주세요.')
  })

  it('passes the signal to fetch and resolves to CANCELLED when the request is aborted', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const pending = postAction('/api/x', {}, { signal: controller.signal })
    controller.abort()
    const result = await pending

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal)
    expect(result).toEqual({
      ok: false,
      error: { code: 'CANCELLED', message: '취소했습니다.' },
    })
  })

  it('turns a non-JSON or foreign body into a failed result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502</html>', { status: 502 })),
    )
    const html = await postAction('/api/x', {})
    expect(html.ok).toBe(false)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: '로그인이 필요합니다.' })),
    )
    const foreign = await postAction('/api/x', {})
    expect(foreign.ok).toBe(false)
  })
})
