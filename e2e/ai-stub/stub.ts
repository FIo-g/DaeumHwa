// Local stand-in for the Anthropic Messages API. The app points ANTHROPIC_BASE_URL here.
// Answers come from ./responders, so no model is called. server.ts starts it for Playwright;
// stub.test.ts starts it on an ephemeral port.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { respond, type RespondBody, UnknownSystemError } from './responders'

const CHUNK_CODE_POINTS = 40
const STUB_USAGE = { input_tokens: 10, output_tokens: 10 }
const MESSAGES_PATH = '/v1/messages'
const HEALTH_PATH = '/health'

let replyCount = 0

function textOf(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  return content
    .map((block: unknown) => {
      const text = (block as { text?: unknown } | null)?.text
      return typeof text === 'string' ? text : ''
    })
    .join('')
}

/**
 * Path of a request URL without its query string. The SDK sends the beta Messages API to the same
 * path with `?beta=true`, so the raw URL cannot be compared.
 */
function pathOf(url: string | undefined): string {
  return new URL(url ?? '', 'http://stub.local').pathname
}

/** Reads the parts of a Messages API request the stub needs. Null when the shape is wrong. */
function parseBody(raw: unknown): RespondBody | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as Record<string, unknown>
  if (typeof body.model !== 'string' || !Array.isArray(body.messages)) return null
  const messages = body.messages.map((message: unknown) => {
    const m = message as { role?: unknown; content?: unknown }
    return { role: String(m.role ?? ''), content: textOf(m.content) ?? '' }
  })
  return {
    system: textOf(body.system) ?? '',
    messages,
    model: body.model,
    stream: body.stream === true,
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, {
    type: 'error',
    error: { type: 'invalid_request_error', message },
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function nextId(): string {
  replyCount += 1
  return `msg_stub_${replyCount}`
}

async function sendMessage(res: ServerResponse, body: RespondBody): Promise<void> {
  const reply = respond(body)
  const id = nextId()
  if (!body.stream) {
    await sleep(reply.delayMs)
    sendJson(res, 200, {
      id,
      type: 'message',
      role: 'assistant',
      model: body.model,
      content: [{ type: 'text', text: reply.text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: STUB_USAGE,
    })
    return
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  sse(res, 'message_start', {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      model: body.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: STUB_USAGE.input_tokens, output_tokens: 0 },
    },
  })
  sse(res, 'content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  })
  await sleep(reply.delayMs)
  const codePoints = Array.from(reply.text)
  for (let i = 0; i < codePoints.length; i += CHUNK_CODE_POINTS) {
    if (res.destroyed) return
    sse(res, 'content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: codePoints.slice(i, i + CHUNK_CODE_POINTS).join('') },
    })
  }
  sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
  sse(res, 'message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: STUB_USAGE.output_tokens },
  })
  sse(res, 'message_stop', { type: 'message_stop' })
  res.end()
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** The stub HTTP server. The caller decides the port and calls listen. */
export function createStubServer(): Server {
  return createServer(async (req, res) => {
    try {
      const path = pathOf(req.url)
      if (req.method === 'GET' && path === HEALTH_PATH) {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('ok')
        return
      }
      if (req.method !== 'POST' || path !== MESSAGES_PATH) {
        sendError(res, 404, `Not found: ${req.method} ${req.url}`)
        return
      }
      const body = parseBody(await readJson(req).catch(() => null))
      if (!body) {
        sendError(res, 400, 'Invalid request body')
        return
      }
      await sendMessage(res, body)
    } catch (error) {
      if (res.headersSent) {
        res.end()
        return
      }
      if (error instanceof UnknownSystemError) {
        sendError(res, 400, error.message)
        return
      }
      sendError(res, 500, error instanceof Error ? error.message : 'Stub failure')
    }
  })
}
