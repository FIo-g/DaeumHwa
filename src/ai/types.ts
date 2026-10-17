import type { z } from 'zod'
import type { AiTaskName } from '@/db/types'

export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type AiUsage = { inputTokens: number; outputTokens: number }

export interface GenerateObjectArgs<T> {
  system: string
  prompt: string
  schema: z.ZodType<T>
  effort: AiEffort
  maxTokens: number
  /** Returned by the fake client; the Anthropic client never calls it. */
  fake: () => T
  model?: string
}

export interface StreamTextArgs {
  system: string
  prompt: string
  effort: AiEffort
  maxTokens: number
  /** Returned by the fake client, split into chunks for streaming. */
  fake: () => string
  model?: string
}

export interface AiClient {
  provider: 'anthropic' | 'opencode' | 'fake'
  defaultModel: string
  generateObject<T>(
    args: GenerateObjectArgs<T>,
  ): Promise<{ object: T; usage: AiUsage; model: string }>
  streamText(args: StreamTextArgs): {
    textStream: AsyncIterable<string>
    final: Promise<{ text: string; usage: AiUsage; model: string }>
  }
}

/** One AI task: prompt, output schema, deterministic fake output and optional post-processing. */
export interface AiTaskDef<I, O> {
  name: AiTaskName
  effort: AiEffort
  maxTokens: number
  system: string
  buildPrompt(input: I): string
  schema: z.ZodType<O>
  fake(input: I): O
  postProcess?(output: O, input: I): O
  model?: () => string | undefined
}
