'use client'

import { type FormEvent, useState, useSyncExternalStore } from 'react'
import { PopButton, Sheet } from '@/components/motion'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { runAction } from '@/lib/client/run-action'
import { createWorkAction } from '@/server/actions/works'
import { StartChoices } from './start-choices'

type CreatedWork = { id: string; title: string }

const subscribe = () => () => {}

/** Title, genre and one-line introduction; then the three ways to start the work. */
export function NewWorkForm() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<CreatedWork | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    try {
      const work = await runAction(
        createWorkAction({
          title: String(form.get('title') ?? ''),
          genre: String(form.get('genre') ?? ''),
          logline: String(form.get('logline') ?? ''),
        }),
      )
      if (work) setCreated(work)
    } finally {
      setPending(false)
    }
  }

  if (created) {
    return (
      <Sheet className="wg-works-created" aria-labelledby="works-created">
        <h2
          id="works-created"
          className="b-heading wrap-anywhere"
          tabIndex={-1}
          ref={(node) => node?.focus()}
        >
          {created.title}
        </h2>
        <p className="b-lede b-muted">작품을 만들었어요. 어떻게 시작할까요?</p>
        <StartChoices workId={created.id} created />
      </Sheet>
    )
  }

  return (
    <form method="post" onSubmit={onSubmit} className="wg-works-form">
      <div className="wg-works-field">
        <Label htmlFor="title">제목</Label>
        <Input id="title" name="title" readOnly={!hydrated} required maxLength={100} autoFocus />
      </div>
      <div className="wg-works-field">
        <Label htmlFor="genre">장르</Label>
        <Input
          id="genre"
          name="genre"
          readOnly={!hydrated}
          maxLength={50}
          placeholder="예: 현대 판타지"
        />
      </div>
      <div className="wg-works-field">
        <Label htmlFor="logline">한 줄 소개</Label>
        <Input id="logline" name="logline" readOnly={!hydrated} maxLength={200} />
      </div>
      <div className="wg-works-form-action">
        <PopButton type="submit" disabled={!hydrated} pending={pending}>
          작품 만들기
        </PopButton>
      </div>
    </form>
  )
}
