'use client'

import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { SubmitButton } from '@/components/app/submit-button'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { runAction } from '@/lib/client/run-action'
import { createWorkAction } from '@/server/actions/works'

type CreatedWork = { id: string; title: string }

/** Title, genre and one-line introduction; then the three ways to start the work. */
export function NewWorkForm() {
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

  if (created) return <StartChoice workId={created.id} />

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">제목</Label>
        <Input id="title" name="title" required maxLength={100} autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="genre">장르</Label>
        <Input id="genre" name="genre" maxLength={50} placeholder="예: 현대 판타지" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logline">한 줄 소개</Label>
        <Input id="logline" name="logline" maxLength={200} />
      </div>
      <div>
        <SubmitButton pending={pending}>작품 만들기</SubmitButton>
      </div>
    </form>
  )
}

function StartChoice({ workId }: { workId: string }) {
  const base = `/works/${workId}`
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">작품을 만들었습니다. 어떻게 시작할까요?</p>
      <Link
        href={`${base}/interview`}
        className={buttonVariants({ variant: 'outline', className: 'h-auto justify-start py-3' })}
      >
        인터뷰로 설정 정리하기
      </Link>
      <Link
        href={`${base}/import`}
        className={buttonVariants({ variant: 'outline', className: 'h-auto justify-start py-3' })}
      >
        기존 원고 가져오기
      </Link>
      <Link
        href={`${base}/write`}
        className={buttonVariants({ variant: 'outline', className: 'h-auto justify-start py-3' })}
      >
        바로 쓰기
      </Link>
    </div>
  )
}
