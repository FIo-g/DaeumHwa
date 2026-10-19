import { proofreadTask } from '@/ai/tasks/proofread'

export const proofreadSample = proofreadTask.buildPrompt({ text: 'She go to the tower.' })
