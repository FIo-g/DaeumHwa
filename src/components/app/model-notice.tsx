import { getAiProvider } from '@/lib/ai-mode'
import { isTrainingDataModel, providerDefaultModel, providerImportModel } from '@/ai/models'

/**
 * Warning shown while an OpenCode model may train on the manuscript and settings sent to it.
 * Only the default and import models are checked; other providers show nothing.
 */
export function ModelNotice() {
  if (getAiProvider() !== 'opencode') return null
  const model = [providerDefaultModel('opencode'), providerImportModel('opencode')].find((name) =>
    isTrainingDataModel(name),
  )
  if (!model) return null
  return (
    <div
      role="status"
      className="border-b bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      현재 AI 모델({model})은 보낸 원고와 설정이 모델 학습에 쓰일 수 있습니다. 공개 전 원고라면 다른
      모델을 쓰세요.
    </div>
  )
}
