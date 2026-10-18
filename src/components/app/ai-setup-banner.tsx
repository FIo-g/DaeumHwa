import { isAiConfigured } from '@/lib/ai-mode'

/** Notice shown at the top of the app while no AI key is configured. */
export function AiSetupBanner() {
  if (isAiConfigured()) return null
  return (
    <div
      role="status"
      className="border-b bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      AI 키가 설정되지 않았습니다. ANTHROPIC_API_KEY 또는 OPENCODE_API_KEY를 설정하면 AI 기능을 쓸
      수 있습니다.
    </div>
  )
}
