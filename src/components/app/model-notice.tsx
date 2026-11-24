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
    <div role="status" className="wg-shell-notice">
      현재 AI 모델(<code className="wrap-anywhere">{model}</code>)에 보낸 원고와 설정은 모델 학습에
      쓰일 수 있어요. 공개 전 원고에는 다른 모델을 쓰세요.
    </div>
  )
}
