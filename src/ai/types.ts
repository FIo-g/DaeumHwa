import type { z } from 'zod'
import type { AiTaskName } from '@/db/types'

export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type AiUsage = { inputTokens: number; outputTokens: number }

export const AI_CANCELLED_MESSAGE = '취소했습니다.'
export const AI_TIMEOUT_MESSAGE = 'AI 응답이 너무 오래 걸려 멈췄습니다. 다시 시도해 주세요.'

/** Which task a call serves, and its input. Test clients use it to pick a fixed output; real clients ignore it. */
export type AiTaskRef = { name: AiTaskName; input: unknown }

export interface GenerateObjectArgs<T> {
  task: AiTaskRef
  system: string
  prompt: string
  schema: z.ZodType<T>
  effort: AiEffort
  maxTokens: number
  model?: string
  signal?: AbortSignal
  timeoutMs?: number
}

export interface StreamTextArgs {
  task: AiTaskRef
  system: string
  prompt: string
  effort: AiEffort
  maxTokens: number
  model?: string
  signal?: AbortSignal
  timeoutMs?: number
}

export interface AiClient {
  /** Label of the backend, e.g. 'anthropic', 'opencode' or 'test'. */
  provider: string
  defaultModel: string
  generateObject<T>(
    args: GenerateObjectArgs<T>,
  ): Promise<{ object: T; usage: AiUsage; model: string }>
  streamText(args: StreamTextArgs): {
    textStream: AsyncIterable<string>
    final: Promise<{ text: string; usage: AiUsage; model: string }>
  }
}

/** One AI task: prompt, output schema and optional post-processing. */
export interface AiTaskDef<I, O> {
  name: AiTaskName
  effort: AiEffort
  maxTokens: number
  system: string
  buildPrompt(input: I): string
  schema: z.ZodType<O>
  postProcess?(output: O, input: I): O
  model?: () => string | undefined
  timeoutMs?: number
}
