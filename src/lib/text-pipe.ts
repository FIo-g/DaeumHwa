// Unbounded text queue between a producer and one or more readers. Every reader receives all the
// chunks from the start, then either the normal end or the failure. A producer that never has a
// reader is fine: the chunks simply stay in memory.

export type TextPipe = {
  push(chunk: string): void
  end(): void
  fail(error: unknown): void
  iterable: AsyncIterable<string>
}

export function createTextPipe(): TextPipe {
  const chunks: string[] = []
  let closed = false
  let failure: { error: unknown } | null = null
  let wakers: (() => void)[] = []

  const wakeAll = () => {
    const pending = wakers
    wakers = []
    for (const wake of pending) wake()
  }

  async function* read(): AsyncGenerator<string> {
    let index = 0
    while (true) {
      if (index < chunks.length) {
        yield chunks[index]
        index++
        continue
      }
      if (failure) throw failure.error
      if (closed) return
      await new Promise<void>((resolve) => wakers.push(resolve))
    }
  }

  return {
    push(chunk) {
      if (closed || failure) return
      chunks.push(chunk)
      wakeAll()
    },
    end() {
      if (closed || failure) return
      closed = true
      wakeAll()
    },
    fail(error) {
      if (closed || failure) return
      failure = { error }
      wakeAll()
    },
    iterable: { [Symbol.asyncIterator]: read },
  }
}
