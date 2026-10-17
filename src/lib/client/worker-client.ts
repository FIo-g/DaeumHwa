import * as Comlink from 'comlink'
import type { ExportPayload, ScheduleInput } from '@/db/types'
import type { DiffMode, DiffPart } from '@/lib/diff'
import type { SplitChapter, SplitMethod } from '@/lib/import/split'
import type { Mention, MentionTarget } from '@/lib/korean/mentions'
import type { ScheduleResult } from '@/lib/schedule'
import type { SearchItem } from '@/lib/search'
import { createTextApi } from '@/workers/text-api'

export interface TextWorkerApi {
  parseFile(
    name: string,
    bytes: ArrayBuffer,
  ): Promise<{ text: string; encoding: string; format: string }>
  splitChapters(
    text: string,
    options?: { fallbackChars?: number },
  ): Promise<{ chapters: SplitChapter[]; method: SplitMethod }>
  diffTexts(a: string, b: string, mode?: DiffMode): Promise<DiffPart[]>
  buildBackupZip(payload: ExportPayload): Promise<Uint8Array>
  findMentions(text: string, targets: MentionTarget[]): Promise<Mention[]>
  computeSchedule(input: ScheduleInput, today: string): Promise<ScheduleResult>
  setSearchItems(items: SearchItem[]): Promise<void>
  search(query: string, limit?: number): Promise<SearchItem[]>
}

let client: TextWorkerApi | null = null

/**
 * The shared text worker (lazy singleton). Falls back to running the same API on the main
 * thread when Workers are missing or cannot start.
 */
export function getTextWorker(): TextWorkerApi {
  if (!client) client = startWorker() ?? createTextApi()
  return client
}

function startWorker(): TextWorkerApi | null {
  if (typeof Worker === 'undefined') return null
  try {
    const worker = new Worker(new URL('../../workers/text.worker.ts', import.meta.url), {
      type: 'module',
    })
    return Comlink.wrap<TextWorkerApi>(worker)
  } catch {
    return null
  }
}
