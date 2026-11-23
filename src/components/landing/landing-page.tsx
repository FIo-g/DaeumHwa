import Link from 'next/link'
import type { ReactNode } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { SAMPLE_WORK } from '@/lib/sample-work'
import { cn } from '@/lib/utils'
import { ProofCircle } from './proof-mark'
import { ProofRow } from './proof-row'

type PlantedError = {
  chapter: number
  quote: string
  wrong: string
  correction: string
  entryKey: string
}

// Which words in each planted sentence are wrong, and what the wiki says instead. The sentences and
// facts themselves come from SAMPLE_WORK, so this page never shows anything the sample does not hold.
const MARKS: Omit<PlantedError, 'quote'>[] = [
  { chapter: 3, wrong: '열한 층', correction: '아홉 층', entryKey: 'jongru' },
  { chapter: 3, wrong: '왼손', correction: '오른손', entryKey: 'doyunseo' },
  { chapter: 2, wrong: '19살', correction: '16살', entryKey: 'serin' },
]

const ERRORS: PlantedError[] = MARKS.map((mark) => {
  const planted = SAMPLE_WORK.plantedErrors.find(
    (e) => e.chapter === mark.chapter && e.quote.includes(mark.wrong),
  )
  if (!planted) throw new Error(`sample sentence missing for ${mark.wrong}`)
  return { ...mark, quote: planted.quote }
})

function factOf(entryKey: string) {
  const fact = SAMPLE_WORK.facts.find((f) => f.entryKey === entryKey)
  const entry = SAMPLE_WORK.entries.find((e) => e.key === entryKey)
  if (!fact || !entry) throw new Error(`sample fact missing for ${entryKey}`)
  return { content: fact.content, name: entry.name }
}

// The opening of 3화 up to the first planted sentence, and the sentence after it.
const CHAPTER_3 = SAMPLE_WORK.chapters[2].body
const HERO = ERRORS[0]
const heroAt = CHAPTER_3.indexOf(HERO.quote)
const HERO_BEFORE = CHAPTER_3.slice(0, heroAt).trim()
const heroAfterStart = CHAPTER_3.indexOf('.', heroAt) + 1
const HERO_AFTER = CHAPTER_3.slice(heroAfterStart, CHAPTER_3.indexOf('.', heroAfterStart + 1) + 1)

/** Splits a sentence around its wrong words so the words can be circled. */
function marked(error: PlantedError, circle: (words: string) => ReactNode) {
  const at = error.quote.indexOf(error.wrong)
  return (
    <>
      {error.quote.slice(0, at)}
      {circle(error.wrong)}
      {error.quote.slice(at + error.wrong.length)}.
    </>
  )
}

/** Two columns of the proof: the text block and, on wide screens, the margin after a rule. */
const SHEET_ROW = 'lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]'
const MARGIN_CELL = 'lg:border-l lg:border-rule lg:pl-10'

function MarginNote({ error, className }: { error: PlantedError; className?: string }) {
  const fact = factOf(error.entryKey)
  return (
    <div
      className={cn(
        'relative z-10 mt-4 border-t border-rule bg-sheet pt-4 lg:mt-[calc(var(--leader-y,0.75rem)-0.75rem)] lg:border-t-0 lg:pt-0',
        className,
      )}
    >
      <p className="font-serif text-2xl leading-none font-semibold text-mark">{error.correction}</p>
      <blockquote className="mt-3 font-serif text-lg leading-relaxed text-canon">
        {fact.content}
      </blockquote>
      <p className="mt-1.5 text-sm text-muted-foreground">위키 {fact.name} 카드의 확정 사실</p>
    </div>
  )
}

function StartActions() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <Link href="/signup" className={cn(buttonVariants(), 'h-12 px-6 text-base font-semibold')}>
        시작하기
      </Link>
      <Link href="/login" className="text-base underline decoration-rule hover:decoration-current">
        로그인
      </Link>
    </div>
  )
}

const THREAD_AXIS = [1, 2, 3, 4, 5, 6]

export function LandingPage() {
  return (
    <div className="flex flex-1 flex-col bg-background break-keep sm:px-6 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col bg-sheet shadow-sheet">
        <header className={cn(SHEET_ROW, 'items-baseline px-6 pt-6 sm:px-12 lg:px-20 lg:pt-8')}>
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-2xl font-bold tracking-tight">다음화</span>
            <Link href="/login" className="text-base underline decoration-rule lg:hidden">
              로그인
            </Link>
          </div>
          <nav aria-label="계정" className={cn(MARGIN_CELL, 'hidden lg:block')}>
            <Link
              href="/login"
              className="text-base underline decoration-rule hover:decoration-current"
            >
              로그인
            </Link>
          </nav>
        </header>

        <main className="flex flex-1 flex-col">
          {/* First screen: the promise, the action, and one real line of 3화 with its mark. */}
          <section
            aria-labelledby="hero-title"
            className="px-6 pt-14 pb-16 sm:px-12 lg:px-20 lg:pt-20"
          >
            <div className={SHEET_ROW}>
              <div className="max-w-[46rem]">
                <h1
                  id="hero-title"
                  className="font-serif text-[2.5rem] leading-[1.18] font-bold tracking-[-0.02em] text-balance sm:text-5xl lg:text-[3.75rem]"
                >
                  백 화를 넘겨도,
                  <br />
                  3화에 정한 설정 그대로.
                </h1>
                <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-foreground/85 sm:text-xl">
                  다음화는 새 회차를 작가가 정한 설정과 맞춰 봅니다. 어긋난 문장에는 표시를 하고,
                  여백에 위키 원문을 붙여 돌려 드립니다. 고칠지는 작가가 정합니다.
                </p>
                <div className="mt-8">
                  <StartActions />
                </div>
              </div>
            </div>

            <div className="mt-14 lg:mt-16">
              <p className="text-sm text-muted-foreground">샘플 작품 「잿빛 종루」 3화</p>
              <ProofRow className={cn(SHEET_ROW, '-ml-6 mt-3 overflow-x-clip pl-6')}>
                <p className="max-w-[44rem] font-serif text-xl leading-[2.1] sm:text-2xl">
                  {HERO_BEFORE}{' '}
                  {marked(HERO, (words) => (
                    <ProofCircle animate leader>
                      {words}
                    </ProofCircle>
                  ))}
                  {HERO_AFTER}
                </p>
                <div className={MARGIN_CELL}>
                  <MarginNote error={HERO} />
                </div>
              </ProofRow>
            </div>
          </section>

          {/* The three planted errors, as the check returns them. */}
          <section
            aria-labelledby="errors-title"
            className="border-t border-rule px-6 py-16 sm:px-12 lg:px-20 lg:py-20"
          >
            <div className={SHEET_ROW}>
              <div className="max-w-[40rem]">
                <h2
                  id="errors-title"
                  className="font-serif text-3xl leading-tight font-semibold text-balance sm:text-4xl"
                >
                  어긋난 곳마다, 원고 문장과 위키 원문을 나란히
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-foreground/85">
                  샘플 작품에는 1~3화 원고에 설정과 어긋나는 문장 세 곳을 심어 두었습니다. 회차
                  점검은 이런 문장을 찾아, 위키에 적힌 사실을 그대로 옮겨 붙입니다.
                </p>
              </div>
            </div>
            <ol className="mt-12 grid gap-10 lg:gap-12">
              {ERRORS.map((error) => (
                <li key={error.quote}>
                  <ProofRow className={cn(SHEET_ROW, '-ml-6 overflow-x-clip pl-6')}>
                    <div className="max-w-[44rem]">
                      <p className="text-sm text-muted-foreground">{error.chapter}화 원고</p>
                      <p className="mt-2 font-serif text-xl leading-[2.1]">
                        {marked(error, (words) => (
                          <ProofCircle leader>{words}</ProofCircle>
                        ))}
                      </p>
                    </div>
                    <div className={MARGIN_CELL}>
                      <MarginNote error={error} />
                    </div>
                  </ProofRow>
                </li>
              ))}
            </ol>
          </section>

          {/* What the author does with a finding, and how the canon grows. */}
          <section
            aria-labelledby="decide-title"
            className="border-t border-rule px-6 py-16 sm:px-12 lg:px-20 lg:py-20"
          >
            <div className={SHEET_ROW}>
              <div className="max-w-[40rem]">
                <h2
                  id="decide-title"
                  className="font-serif text-3xl leading-tight font-semibold text-balance sm:text-4xl"
                >
                  고칠지는 작가가 정합니다
                </h2>
                <dl className="mt-8 grid gap-6 text-lg leading-relaxed">
                  <div>
                    <dt className="font-semibold">제안대로 고치기</dt>
                    <dd className="text-foreground/85">원고 문장을 위키에 맞게 바꿉니다.</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">위키 고치기</dt>
                    <dd className="text-foreground/85">원고가 맞다면 위키의 사실을 고칩니다.</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">무시</dt>
                    <dd className="text-foreground/85">일부러 둔 차이라면 지적만 닫습니다.</dd>
                  </div>
                </dl>
              </div>
              <div className={cn(MARGIN_CELL, 'mt-10 lg:mt-0')}>
                <p className="text-lg leading-relaxed">
                  회차를 완료로 바꾸면 점검이 저절로 돌고, 새로 찾은 설정 후보는 승인 대기에
                  올라옵니다.
                </p>
                <p className="mt-4 text-lg leading-relaxed">
                  AI는 위키를 직접 고치지 않습니다. 작가가 승인한 것만 위키에 들어가고, 모든 변경은
                  이력에 남습니다.
                </p>
              </div>
            </div>
          </section>

          {/* The canon: one card and the thread ledger on a chapter axis. */}
          <section
            aria-labelledby="canon-title"
            className="border-t border-rule px-6 py-16 sm:px-12 lg:px-20 lg:py-20"
          >
            <div className={SHEET_ROW}>
              <div className="max-w-[44rem]">
                <h2
                  id="canon-title"
                  className="font-serif text-3xl leading-tight font-semibold text-balance sm:text-4xl"
                >
                  설정과 떡밥은 한곳에
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-foreground/85">
                  인물, 장소, 세계관 규칙을 카드로 모으고, 떡밥은 심은 회차와 회수할 회차를 장부에
                  적어 둡니다. 샘플 작품의 떡밥 장부입니다.
                </p>
                <ThreadLedger />
              </div>
              <div className={cn(MARGIN_CELL, 'mt-10 lg:mt-0')}>
                <p className="text-lg leading-relaxed">사실마다 상태를 붙입니다.</p>
                <dl className="mt-5 grid gap-4">
                  <div>
                    <dt>
                      <span className="font-serif text-lg underline decoration-canon decoration-2 underline-offset-[0.3em]">
                        확정
                      </span>
                    </dt>
                    <dd className="text-muted-foreground">
                      작가가 정한 사실. 점검의 근거가 됩니다.
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <span className="font-serif text-lg underline decoration-canon decoration-dashed decoration-2 underline-offset-[0.3em]">
                        가정
                      </span>
                    </dt>
                    <dd className="text-muted-foreground">아직 짐작인 사실. 따로 표시해 둡니다.</dd>
                  </div>
                  <div>
                    <dt>
                      <span className="font-serif text-lg underline decoration-input decoration-dotted decoration-2 underline-offset-[0.3em]">
                        미정
                      </span>
                    </dt>
                    <dd className="text-muted-foreground">정하지 않은 것. 나중에 채웁니다.</dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="start-title"
            className="border-t border-rule px-6 py-16 sm:px-12 lg:px-20 lg:py-24"
          >
            <h2
              id="start-title"
              className="font-serif text-3xl leading-tight font-semibold text-balance sm:text-4xl"
            >
              샘플 작품으로 먼저 점검해 보세요
            </h2>
            <p className="mt-4 max-w-[36rem] text-lg leading-relaxed text-foreground/85">
              가입하면 내 작품 화면에서 샘플 작품을 바로 만들 수 있습니다. 만들면 3화가 열리고 회차
              점검이 돌아갑니다.
            </p>
            <div className="mt-8">
              <StartActions />
            </div>
          </section>
        </main>

        <footer className="border-t border-rule px-6 py-8 text-sm text-muted-foreground sm:px-12 lg:px-20">
          다음화, 장기 연재 웹소설 작가를 위한 설정 위키와 회차 점검
        </footer>
      </div>
    </div>
  )
}

function ThreadLedger() {
  return (
    <figure className="mt-10">
      <figcaption className="sr-only">
        샘플 작품의 떡밥 세 개와 심은 회차, 회수 목표 회차
      </figcaption>
      <div className="grid grid-cols-[minmax(7rem,9rem)_repeat(6,minmax(0,1fr))] items-center gap-y-4 text-sm">
        <span />
        {THREAD_AXIS.map((n) => (
          <span key={n} className="text-center text-muted-foreground tabular-nums">
            {n}화
          </span>
        ))}
        {SAMPLE_WORK.threads.map((thread) => {
          const to = thread.targetChapterPosition
          const from = thread.plantedChapter
          const planned = from === null
          // Every mark sits at the centre of its chapter column, under that chapter's label.
          const centre = (n: number) => `${((n - 0.5) / THREAD_AXIS.length) * 100}%`
          const start = planned ? to - 0.5 : Math.min(from, to)
          return (
            <div key={thread.title} className="contents">
              <span className="pr-3 font-serif text-base">{thread.title}</span>
              <span
                className="relative col-span-6 h-6"
                role="img"
                aria-label={
                  planned
                    ? `${thread.title}: 아직 심지 않음, ${to}화에 회수 목표`
                    : `${thread.title}: ${from}화에 심음, ${to}화에 회수 목표`
                }
              >
                <span
                  className={cn(
                    'absolute top-1/2 h-0 -translate-y-1/2 border-t-2',
                    planned ? 'border-dotted border-input' : 'border-canon',
                  )}
                  style={{ left: centre(start), right: `calc(100% - ${centre(to)})` }}
                />
                {!planned && (
                  <span
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-canon"
                    style={{ left: centre(from) }}
                  />
                )}
                <span
                  className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-mark"
                  style={{ left: centre(to) }}
                />
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-5 text-sm text-muted-foreground">
        파란 점은 심은 회차, 붉은 원은 회수 목표 회차입니다. 점선은 아직 심지 않은 떡밥입니다.
      </p>
    </figure>
  )
}
