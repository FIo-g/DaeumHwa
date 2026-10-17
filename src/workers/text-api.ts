import type { TextWorkerApi } from '@/lib/client/worker-client'
import { buildBackupFiles, zipBackup } from '@/lib/backup'
import { diffTexts } from '@/lib/diff'
import { parseManuscriptFile } from '@/lib/import/parse-file'
import { splitChapters } from '@/lib/import/split'
import { findMentions } from '@/lib/korean/mentions'
import { computeSchedule } from '@/lib/schedule'
import { buildSearchIndex, searchIndex, type SearchIndex } from '@/lib/search'

/**
 * CPU-heavy client work: file parsing, chapter splitting, diff, backup zip, schedule, search.
 * The dedicated worker exposes this API (see text.worker.ts); the main thread uses it directly
 * when Web Workers are unavailable.
 */
export function createTextApi(): TextWorkerApi {
  let search: SearchIndex = buildSearchIndex([])

  const api: TextWorkerApi = {
    async parseFile(name, bytes) {
      return parseManuscriptFile(name, bytes)
    },
    async splitChapters(text, options) {
      return splitChapters(text, options)
    },
    async diffTexts(a, b, mode) {
      return diffTexts(a, b, mode)
    },
    async buildBackupZip(payload) {
      return zipBackup(buildBackupFiles(payload))
    },
    async findMentions(text, targets) {
      return findMentions(text, targets)
    },
    async computeSchedule(input, today) {
      return computeSchedule(input, today)
    },
    async setSearchItems(items) {
      search = buildSearchIndex(items)
    },
    async search(query, limit) {
      return searchIndex(search, query, limit)
    },
  }
  return api
}
