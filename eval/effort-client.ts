import type { AiClient, AiEffort } from '@/ai/types'

// Wraps a client so every call runs at one effort. Used by the task-level eval tools
// (run-continuity --effort, replay-calls --effort). Provider, model and every other arg are kept.
export function withEffort(client: AiClient, effort: AiEffort): AiClient {
  return {
    provider: client.provider,
    defaultModel: client.defaultModel,
    generateObject(args) {
      return client.generateObject({ ...args, effort })
    },
    streamText(args) {
      return client.streamText({ ...args, effort })
    },
  }
}
