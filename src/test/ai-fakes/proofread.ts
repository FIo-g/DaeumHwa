import type { ProofreadOutput } from '@/ai/tasks/proofread'

// Stand-in output for the proofread task: no suggestions. Used only by tests (see src/test/fake-ai.ts).
export function fakeProofread(): ProofreadOutput {
  return { suggestions: [] }
}
