'use client'

import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type KeyboardEvent, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ChapterStatus } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { formatKoreanDateTime, isPlausibleIsoDate } from '@/lib/dates'
import { CHAPTER_STATUS_LABEL, chapterLabel } from '@/lib/labels'
import type { ActionResult } from '@/lib/result'
import {
  archiveChapterAction,
  moveChapterAction,
  restoreChapterAction,
  setChapterPublishedOnAction,
  setChapterStatusAction,
} from '@/server/actions/chapters'

export type ChapterTableRow = {
  id: string
  position: number
  title: string
  status: ChapterStatus
  charCount: number
  publishedOn: string | null
  /** ISO timestamp. */
  updatedAt: string
  /** ISO timestamp, or null when the chapter is visible. */
  archivedAt: string | null
}

type ChapterTableProps = {
  workId: string
  /** Every chapter of the work in manuscript order, archived ones included. */
  chapters: ChapterTableRow[]
  /** Editor role or higher. Viewers see the table read-only. */
  canEdit: boolean
}

/**
 * Chapter list for 회차 관리. Archived chapters are hidden until the toggle is on.
 * Status, publish date, order, archive and restore go through server actions, then refresh.
 */
export function ChapterTable({ workId, chapters, canEdit }: ChapterTableProps) {
  const router = useRouter()
  const [showArchived, setShowArchived] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const visible = chapters.filter((c) => c.archivedAt === null)
  const shown = showArchived ? chapters : visible

  /** Runs one action and refreshes the page on success. Resolves to whether it succeeded. */
  async function perform(
    key: string,
    promise: Promise<ActionResult<unknown>>,
    success?: string,
  ): Promise<boolean> {
    setBusyKey(key)
    try {
      const data = await runAction(promise, success ? { success } : undefined)
      if (data === null) return false
      router.refresh()
      return true
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Checkbox
          id="show-archived-chapters"
          aria-label="보관한 회차 보기"
          checked={showArchived}
          onCheckedChange={(checked) => setShowArchived(checked === true)}
        />
        <Label htmlFor="show-archived-chapters">보관한 회차 보기</Label>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="아직 회차가 없습니다"
          description={canEdit ? '새 회차를 만들어 원고를 시작해 보세요.' : undefined}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>회차</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">글자 수 (공백 포함)</TableHead>
              <TableHead>연재일</TableHead>
              <TableHead className="hidden md:table-cell">수정일</TableHead>
              {canEdit && <TableHead>순서</TableHead>}
              {canEdit && <TableHead>관리</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((chapter) => {
              const archived = chapter.archivedAt !== null
              const label = chapterLabel(chapter.position, chapter.title)
              const visibleIndex = visible.findIndex((c) => c.id === chapter.id)
              const busy = busyKey !== null && busyKey.endsWith(chapter.id)
              return (
                <TableRow
                  key={chapter.id}
                  className={archived ? 'text-muted-foreground' : undefined}
                >
                  <TableCell className="font-medium">
                    {archived ? (
                      <span>
                        {label}
                        <span className="ml-2 text-xs">(보관됨)</span>
                      </span>
                    ) : (
                      <Link
                        href={`/works/${workId}/chapters/${chapter.id}`}
                        className="hover:underline"
                      >
                        {label}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>
                    {canEdit && !archived ? (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`${chapter.position}화 상태 바꾸기`}
                        disabled={busy}
                        onClick={() =>
                          perform(
                            `status-${chapter.id}`,
                            setChapterStatusAction({
                              chapterId: chapter.id,
                              status: chapter.status === 'draft' ? 'done' : 'draft',
                            }),
                          )
                        }
                      >
                        {CHAPTER_STATUS_LABEL[chapter.status]}
                      </Button>
                    ) : (
                      <span>{CHAPTER_STATUS_LABEL[chapter.status]}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {chapter.charCount.toLocaleString('ko-KR')}
                  </TableCell>
                  <TableCell>
                    <PublishedOnInput
                      position={chapter.position}
                      value={chapter.publishedOn}
                      disabled={!canEdit || archived}
                      onSave={(next) =>
                        perform(
                          `date-${chapter.id}`,
                          setChapterPublishedOnAction({ chapterId: chapter.id, publishedOn: next }),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatKoreanDateTime(chapter.updatedAt)}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      {!archived && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`${chapter.position}화 위로 이동`}
                            disabled={busy || visibleIndex <= 0}
                            onClick={() =>
                              perform(
                                `move-${chapter.id}`,
                                moveChapterAction({ chapterId: chapter.id, direction: 'up' }),
                              )
                            }
                          >
                            <ArrowUpIcon />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`${chapter.position}화 아래로 이동`}
                            disabled={busy || visibleIndex === visible.length - 1}
                            onClick={() =>
                              perform(
                                `move-${chapter.id}`,
                                moveChapterAction({ chapterId: chapter.id, direction: 'down' }),
                              )
                            }
                          >
                            <ArrowDownIcon />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                  {canEdit && (
                    <TableCell>
                      {archived ? (
                        <ConfirmButton
                          title="이 회차를 복원할까요?"
                          description="회차 목록에 다시 나타납니다."
                          confirmLabel="복원하기"
                          size="sm"
                          disabled={busy}
                          onConfirm={async () => {
                            await perform(
                              `restore-${chapter.id}`,
                              restoreChapterAction({ chapterId: chapter.id }),
                              '회차를 복원했습니다.',
                            )
                          }}
                        >
                          복원
                        </ConfirmButton>
                      ) : (
                        <ConfirmButton
                          title="이 회차를 보관할까요?"
                          description="보관해도 원고와 이력은 남아 있고, 보관한 회차 보기에서 되돌릴 수 있습니다."
                          confirmLabel="보관하기"
                          size="sm"
                          disabled={busy}
                          onConfirm={async () => {
                            await perform(
                              `archive-${chapter.id}`,
                              archiveChapterAction({ chapterId: chapter.id }),
                              '회차를 보관했습니다.',
                            )
                          }}
                        >
                          보관
                        </ConfirmButton>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

type PublishedOnInputProps = {
  position: number
  value: string | null
  disabled: boolean
  /** Resolves to true when the save succeeded. */
  onSave: (publishedOn: string | null) => Promise<boolean>
}

/**
 * Publish date input. Typing only edits a local draft; the value is saved on blur or Enter,
 * so partial keyboard entry such as `0002-10-17` never reaches the server.
 * A failed or invalid save puts the last saved date back into the field.
 */
function PublishedOnInput({ position, value, disabled, onSave }: PublishedOnInputProps) {
  const saved = value ?? ''
  const [draft, setDraft] = useState(saved)
  // Re-sync the draft when the saved value changes (after a refresh) without an effect.
  const [lastSaved, setLastSaved] = useState(saved)
  if (lastSaved !== saved) {
    setLastSaved(saved)
    setDraft(saved)
  }
  const savingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function commit() {
    if (savingRef.current) return
    // A half-typed date reads as '' but is not a request to clear the date.
    const input = inputRef.current
    if (input?.validity.badInput) {
      toast.error('연재일이 올바르지 않습니다.')
      input.value = saved
      setDraft(saved)
      return
    }
    if (draft === saved) return
    if (draft !== '' && !isPlausibleIsoDate(draft)) {
      toast.error('연재일이 올바르지 않습니다.')
      setDraft(saved)
      return
    }
    savingRef.current = true
    try {
      const ok = await onSave(draft === '' ? null : draft)
      if (!ok) setDraft(saved)
    } finally {
      savingRef.current = false
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void commit()
  }

  return (
    <Input
      ref={inputRef}
      type="date"
      aria-label={`${position}화 연재일`}
      min="2000-01-01"
      max="2100-12-31"
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => void commit()}
      onKeyDown={onKeyDown}
      className="w-40"
    />
  )
}
