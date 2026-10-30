// How an approved plan card becomes prose. `single` (default) writes the chapter in one call.
// `scenes` writes one call per scene, for comparison only. Read once per draft from the env.

export type DraftMode = 'single' | 'scenes'

export function draftModeFromEnv(env: Record<string, string | undefined> = process.env): DraftMode {
  return env.AI_DRAFT_MODE === 'scenes' ? 'scenes' : 'single'
}
