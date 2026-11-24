'use client'

import { useState, type CSSProperties } from 'react'
import {
  Disclosure,
  MarginNote,
  PopButton,
  ProofPair,
  ProofStrike,
  ProofUnderline,
  Sheet,
  useReplay,
} from '@/components/motion'
import { LandingTitle, useLandingEntrance } from './entrance'
import { findings } from './sample-data'

const choices = [
  {
    id: 'manuscript',
    label: '제안대로 고치기',
    description: '원고 문장을 위키대로 바꿔요.',
    status: '문장을 바꿨어요.',
  },
  {
    id: 'wiki',
    label: '위키 고치기',
    description: '틀린 게 위키 쪽일 때 써요.',
    status: '사실을 고쳤어요.',
  },
  {
    id: 'ignore',
    label: '무시',
    description: '복선으로 일부러 비튼 문장은 지적만 닫아 두세요.',
    status: '지적을 닫았어요.',
  },
] as const

const factStates = [
  { label: '확정', rule: 'border-solid', text: '못 박아 둔 설정. 점검의 기준이 돼요.' },
  { label: '가정', rule: 'border-dashed', text: '일단 이렇게 가정해 둔 것. 파선으로 표시돼요.' },
  { label: '미정', rule: 'border-dotted', text: '아직 비워 둔 칸.' },
]

const dagger = findings[1]
const decisionTitle = '마지막 결정은 작가에게'

export function AuthorChoice() {
  const [choice, setChoice] = useState<(typeof choices)[number] | null>(null)
  const { replayKey, replay } = useReplay()
  const entrance = useLandingEntrance<HTMLDivElement>()
  const changedManuscript = choice?.id === 'manuscript'
  const changedWiki = choice?.id === 'wiki'

  return (
    <section aria-labelledby="b-decision-title">
      <div className="b-wrap wg-landing-threads-section space-y-6">
        <LandingTitle id="b-decision-title" columns={decisionTitle.length}>
          {decisionTitle}
        </LandingTitle>
        <div {...entrance} className="wg-landing-threads-choice-entrance">
          <Sheet as="div" className="wg-landing-threads-choice-sheet">
            <div className="min-w-0">
              <div>
                {choices.map((option, index) => (
                  <div
                    key={option.id}
                    className="wg-landing-threads-choice-option"
                    style={{ '--wg-landing-threads-order': index } as CSSProperties}
                  >
                    <PopButton
                      variant={choice === option || (!choice && index === 0) ? 'primary' : 'flat'}
                      arrow={false}
                      className="wg-landing-threads-choice-button"
                      aria-describedby={`wg-landing-threads-choice-${option.id}`}
                      aria-pressed={choice === option}
                      onClick={() => {
                        setChoice(option)
                        replay()
                      }}
                    >
                      {option.label}
                    </PopButton>
                    <p className="b-label" id={`wg-landing-threads-choice-${option.id}`}>
                      {option.description}
                    </p>
                  </div>
                ))}
              </div>
              <ProofPair
                className="wg-landing-threads-choice-proof"
                manuscript={
                  <>
                    <p className="b-label font-medium">원고</p>
                    <p
                      key={replayKey}
                      className="b-manuscript wg-landing-threads-rewrite"
                      data-rewrite={replayKey > 0}
                    >
                      {dagger.before}
                      {changedManuscript ? (
                        <>
                          <ProofStrike replayKey={replayKey}>{dagger.wrong}</ProofStrike>{' '}
                          <span className="wg-landing-threads-correction">오른손</span>
                        </>
                      ) : choice ? (
                        dagger.wrong
                      ) : (
                        <ProofUnderline replayKey={replayKey}>{dagger.wrong}</ProofUnderline>
                      )}
                      {dagger.after}
                    </p>
                  </>
                }
                note={
                  <div
                    key={replayKey}
                    className="wg-landing-threads-rewrite wg-landing-threads-rewrite-wiki"
                    data-rewrite={replayKey > 0}
                  >
                    {changedWiki ? (
                      <>
                        <p className="b-label font-medium">위키 예시</p>
                        <p className="b-manuscript">
                          도윤서는 단검을 <ProofStrike replayKey={replayKey}>오른손</ProofStrike>{' '}
                          <span className="wg-landing-threads-correction">왼손</span>에 쥔다.
                        </p>
                      </>
                    ) : (
                      <MarginNote>{dagger.quote}</MarginNote>
                    )}
                  </div>
                }
              />
              <div className="wg-landing-threads-choice-status">
                <span role="status" className="b-label font-bold">
                  {choice?.status ?? '열린 지적 1건'}
                </span>
                <button
                  type="button"
                  className="b-link b-label wg-landing-threads-reset"
                  onClick={() => {
                    if (!choice) return
                    setChoice(null)
                    replay()
                  }}
                  aria-disabled={!choice}
                >
                  처음으로
                </button>
              </div>
            </div>
            <aside className="wg-landing-threads-facts" id="b-facts">
              <h3 className="b-subhead">설정이라고 다 같은 무게는 아니니까요.</h3>
              <dl className="mt-4">
                {factStates.map(({ label, text, rule }, index) => (
                  <div
                    key={label}
                    className="wg-landing-threads-fact-row"
                    style={{ '--wg-landing-threads-order': index } as CSSProperties}
                  >
                    <dt className={`wg-landing-threads-fact-state ${rule}`}>{label}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
              <Disclosure title="승인 대기" className="wg-landing-threads-approval">
                <div className="space-y-2">
                  <p>
                    완료를 누르는 순간 점검이 돌아가요. 원고에서 새로 나온 설정은 승인 대기로
                    가고요.
                  </p>
                  <p>
                    AI가 위키를 혼자 고치는 일은 없어요. 작가님이 승인한 것만 들어가요. 누가 언제
                    무엇을 바꿨는지는 이력에서 다 볼 수 있어요.
                  </p>
                </div>
              </Disclosure>
            </aside>
          </Sheet>
        </div>
      </div>
    </section>
  )
}
