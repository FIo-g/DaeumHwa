import { isAiConfigured } from '@/lib/ai-mode'

/** Notice shown at the top of the app while no AI key is configured. */
export function AiSetupBanner() {
  if (isAiConfigured()) return null
  return (
    <div role="status" className="wg-shell-notice">
      AI 키가 설정되지 않았어요. <code className="wrap-anywhere">ANTHROPIC_API_KEY</code> 또는{' '}
      <code className="wrap-anywhere">OPENCODE_API_KEY</code>를 설정해 주세요.
    </div>
  )
}
