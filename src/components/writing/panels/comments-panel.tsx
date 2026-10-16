'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { runAction } from '@/lib/client/run-action'
import { formatKoreanDateTime } from '@/lib/dates'
import {
  addCommentAction,
  deleteCommentAction,
  setCommentResolvedAction,
} from '@/server/actions/comments'
import type { CommentView } from '@/server/comments'
import type { Highlight, WorkspaceApi, WritingData } from '../types'
import { hasMinRole, rangeOf } from './shared'

type CommentsPanelProps = {
  data: WritingData
  api: WorkspaceApi
  text: string
}

const BODY_MAX = 2000
const QUOTE_MAX = 500

type Selection = { start: number; end: number; text: string }

/**
 * Comments on the chapter (F16). Commenters can comment, reply and resolve; deleting is limited to
 * the author and the owner, which the server enforces. Viewers only read.
 */
export function CommentsPanel({ data, api, text }: CommentsPanelProps) {
  const canComment = hasMinRole(data.role, 'commenter') && !data.chapter.archivedAt
  const [selection, setSelection] = useState<Selection | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [busy, setBusy] = useState(false)

  const highlights = useMemo<Highlight[]>(
    () =>
      data.comments.flatMap((comment) => {
        if (comment.status === 'resolved' || comment.quote === '') return []
        const range = rangeOf(text, comment.quote, comment.quoteStart)
        if (!range) return []
        return [{ id: comment.id, start: range.start, end: range.end, kind: 'comment' }]
      }),
    [data.comments, text],
  )

  useEffect(() => {
    api.setHighlights('comments', highlights)
  }, [api, highlights])

  useEffect(() => {
    return () => api.setHighlights('comments', [])
  }, [api])

  function startComment() {
    const sel = api.getSelection()
    if (!sel) {
      setNotice('먼저 원고에서 문장을 선택하세요.')
      return
    }
    if (sel.text.length > QUOTE_MAX) {
      setNotice(`인용은 ${QUOTE_MAX}자 이하로 골라 주세요.`)
      return
    }
    setNotice(null)
    setSelection(sel)
  }

  async function submitComment() {
    const trimmed = body.trim()
    if (!selection || trimmed === '') return
    setBusy(true)
    const result = await runAction(
      addCommentAction({
        chapterId: data.chapter.id,
        body: trimmed,
        quote: selection.text,
        quoteStart: selection.start,
        quoteEnd: selection.end,
      }),
      { success: '코멘트를 남겼습니다.' },
    )
    setBusy(false)
    if (result) {
      setSelection(null)
      setBody('')
      api.refresh()
    }
  }

  async function submitReply(parent: CommentView) {
    const trimmed = replyBody.trim()
    if (trimmed === '') return
    setBusy(true)
    const result = await runAction(
      addCommentAction({ chapterId: data.chapter.id, body: trimmed, parentId: parent.id }),
      { success: '답글을 남겼습니다.' },
    )
    setBusy(false)
    if (result) {
      setReplyTo(null)
      setReplyBody('')
      api.refresh()
    }
  }

  async function setResolved(comment: CommentView) {
    const resolved = comment.status !== 'resolved'
    const result = await runAction(setCommentResolvedAction({ commentId: comment.id, resolved }), {
      success: resolved ? '해결했습니다.' : '다시 열었습니다.',
    })
    if (result) api.refresh()
  }

  async function remove(commentId: string) {
    const result = await runAction(deleteCommentAction({ commentId }), {
      success: '코멘트를 지웠습니다.',
    })
    if (result !== null) api.refresh()
  }

  function focus(comment: CommentView) {
    const range = rangeOf(text, comment.quote, comment.quoteStart)
    if (range) api.focusRange(range.start, range.end)
    else toast.error('원고에서 해당 문장을 찾지 못했습니다.')
  }

  return (
    <section aria-label="코멘트" className="grid gap-4">
      {canComment && (
        <div className="grid gap-3 rounded-lg border p-3">
          {selection ? (
            <>
              <p className="rounded-md bg-muted/60 p-2 text-sm leading-6">“{selection.text}”</p>
              <Label htmlFor="comment-body">코멘트 내용</Label>
              <Textarea
                id="comment-body"
                value={body}
                maxLength={BODY_MAX}
                rows={3}
                onChange={(event) => setBody(event.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy || body.trim() === ''}
                  onClick={() => void submitComment()}
                >
                  등록
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelection(null)
                    setBody('')
                  }}
                >
                  취소
                </Button>
              </div>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={startComment}>
              선택한 문장에 코멘트
            </Button>
          )}
          {notice && (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          )}
        </div>
      )}

      {!canComment && (
        <p className="text-xs text-muted-foreground">
          코멘트는 코멘트 작성자 이상이 남길 수 있습니다.
        </p>
      )}

      {data.comments.length === 0 && <EmptyState title="아직 코멘트가 없습니다." />}

      <ul className="grid gap-3">
        {data.comments.map((comment) => {
          const resolved = comment.status === 'resolved'
          return (
            <li
              key={comment.id}
              className={
                resolved
                  ? 'grid gap-2 rounded-lg border p-3 opacity-70'
                  : 'grid gap-2 rounded-lg border p-3'
              }
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{comment.authorName}</span>
                <span>{formatKoreanDateTime(comment.createdAt)}</span>
                {resolved && <Badge variant="secondary">해결됨</Badge>}
              </div>
              {comment.quote && (
                <button
                  type="button"
                  onClick={() => focus(comment)}
                  className="rounded-md bg-muted/60 p-2 text-left text-sm leading-6 hover:bg-muted"
                >
                  “{comment.quote}”
                </button>
              )}
              <p className="whitespace-pre-wrap text-sm leading-6">{comment.body}</p>

              {comment.replies.length > 0 && (
                <ul className="grid gap-2 border-l pl-3">
                  {comment.replies.map((reply) => (
                    <li key={reply.id} className="grid gap-1">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{reply.authorName}</span>{' '}
                        {formatKoreanDateTime(reply.createdAt)}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6">{reply.body}</p>
                    </li>
                  ))}
                </ul>
              )}

              {canComment && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReplyTo(replyTo === comment.id ? null : comment.id)
                      setReplyBody('')
                    }}
                  >
                    답글
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void setResolved(comment)}>
                    {resolved ? '다시 열기' : '해결'}
                  </Button>
                  <ConfirmButton
                    title="코멘트를 지울까요?"
                    description="답글도 함께 지워집니다."
                    confirmLabel="지우기"
                    variant="ghost"
                    size="sm"
                    onConfirm={() => remove(comment.id)}
                  >
                    지우기
                  </ConfirmButton>
                </div>
              )}

              {canComment && replyTo === comment.id && (
                <div className="grid gap-2">
                  <Label htmlFor={`reply-${comment.id}`}>답글 내용</Label>
                  <Textarea
                    id={`reply-${comment.id}`}
                    value={replyBody}
                    maxLength={BODY_MAX}
                    rows={2}
                    onChange={(event) => setReplyBody(event.target.value)}
                  />
                  <div>
                    <Button
                      size="sm"
                      disabled={busy || replyBody.trim() === ''}
                      onClick={() => void submitReply(comment)}
                    >
                      답글 등록
                    </Button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
