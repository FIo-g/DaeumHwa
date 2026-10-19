// Public surface of the shared detector library. Explicit named exports only.
export type { Lang, ForeignScript, ForeignSpan, RepeatedWord, SampleCopyHit } from './types'
export { foreignScriptSpans, foreignScriptRuns } from './scripts'
export { repeatedWords } from './repeats'
export { sampleCopies } from './sample-copy'
export { isNearDuplicateFact } from './fact-similarity'
