import { describe, expect, it } from 'vitest'
import { draftReplaceRecord } from '@/lib/draft-stream'
import { createTextPipe } from '@/lib/text-pipe'

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks
}

describe('createTextPipe', () => {
  it('delivers chunks pushed before iteration in order, then ends', async () => {
    const pipe = createTextPipe()
    pipe.push('가')
    pipe.push('나')
    pipe.end()
    expect(await collect(pipe.iterable)).toEqual(['가', '나'])
  })

  it('delivers buffered chunks before throwing the failure', async () => {
    const pipe = createTextPipe()
    pipe.push('앞')
    pipe.fail(new Error('boom'))
    const chunks: string[] = []
    await expect(
      (async () => {
        for await (const chunk of pipe.iterable) chunks.push(chunk)
      })(),
    ).rejects.toThrow('boom')
    expect(chunks).toEqual(['앞'])
  })

  it('ignores pushes after end', async () => {
    const pipe = createTextPipe()
    pipe.push('a')
    pipe.end()
    pipe.push('b')
    expect(await collect(pipe.iterable)).toEqual(['a'])
  })

  it('ignores pushes after fail', async () => {
    const pipe = createTextPipe()
    pipe.fail(new Error('boom'))
    pipe.push('late')
    await expect(collect(pipe.iterable)).rejects.toThrow('boom')
  })

  it('works when nobody iterates, without an unhandled rejection', async () => {
    const pipe = createTextPipe()
    pipe.push('a')
    pipe.fail(new Error('unread'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const chunks: string[] = []
    await expect(
      (async () => {
        for await (const chunk of pipe.iterable) chunks.push(chunk)
      })(),
    ).rejects.toThrow('unread')
    expect(chunks).toEqual(['a'])
  })

  it('sends a replace record as an ordinary chunk', async () => {
    const pipe = createTextPipe()
    pipe.push('a')
    pipe.replace('b')
    pipe.end()
    expect(await collect(pipe.iterable)).toEqual(['a', draftReplaceRecord('b')])
  })

  it('ignores a replace after end', async () => {
    const pipe = createTextPipe()
    pipe.push('a')
    pipe.end()
    pipe.replace('b')
    expect(await collect(pipe.iterable)).toEqual(['a'])
  })

  it('ignores a replace after fail', async () => {
    const pipe = createTextPipe()
    pipe.fail(new Error('boom'))
    pipe.replace('late')
    // The reader gets every chunk buffered before the failure, so the chunks show what was ignored.
    const chunks: string[] = []
    await expect(
      (async () => {
        for await (const chunk of pipe.iterable) chunks.push(chunk)
      })(),
    ).rejects.toThrow('boom')
    expect(chunks).toEqual([])
  })
})
