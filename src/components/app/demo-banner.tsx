import { isDemoMode } from '@/lib/ai-mode'

/** Notice shown at the top of the app while AI runs in demo (fake) mode. */
export function DemoBanner() {
  if (!isDemoMode()) return null
  return (
    <div
      role="status"
      className="border-b bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      AI 데모 모드: 실제 AI 대신 예시 결과를 보여 줍니다. ANTHROPIC_API_KEY 또는 OPENCODE_API_KEY를
      설정하면 실제 AI를 사용합니다.
    </div>
  )
}
