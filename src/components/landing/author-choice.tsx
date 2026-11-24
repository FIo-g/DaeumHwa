'use client'

import { useState } from 'react'
import {
  ColorBand,
  Disclosure,
  HandNote,
  PopButton,
  ProofStrike,
  ProofUnderline,
  useReplay,
} from '@/components/motion'
import { LandingTitle, PaperBoundary, landingOrder, useLandingEntrance } from './entrance'
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

export function AuthorChoice() {
  const [choice, setChoice] = useState<(typeof choices)[number] | null>(null)
  const { replayKey, replay } = useReplay()
  const choiceEntrance = useLandingEntrance<HTMLDivElement>()
  const factsEntrance = useLandingEntrance<HTMLElement>()
  const changedManuscript = choice?.id === 'manuscript'
  const changedWiki = choice?.id === 'wiki'

  return (
    <ColorBand
      color="apricot"
      className="b-landing-decision"
      innerClassName="b-landing-decision-grid"
      aria-labelledby="b-decision-title"
    >
      <PaperBoundary />
      <div className="min-w-0 space-y-6">
        <LandingTitle id="b-decision-title">마지막 결정은 작가에게</LandingTitle>
        <div {...choiceEntrance} className="b-landing-choices">
          {choices.map((option, index) => (
            <div
              key={option.id}
              className="b-landing-choice-option min-w-0 space-y-2"
              style={landingOrder(index)}
            >
              <PopButton
                variant={index === 0 ? 'primary' : 'flat'}
                aria-describedby={`b-landing-choice-${option.id}`}
                aria-pressed={choice === option}
                onClick={() => {
                  setChoice(option)
                  replay()
                }}
              >
                {option.label}
              </PopButton>
              <p className="b-label" id={`b-landing-choice-${option.id}`}>
                {option.description}
              </p>
            </div>
          ))}
        </div>
        <div className="b-paper space-y-3 bg-paper">
          <div className="b-landing-choice-line">
            <p className="b-label font-bold">원고</p>
            <p className="b-manuscript">
              {dagger.before}
              {changedManuscript ? (
                <>
                  <ProofStrike replayKey={replayKey}>{dagger.wrong}</ProofStrike>{' '}
                  <HandNote replayKey={replayKey} delay={420}>
                    오른손
                  </HandNote>
                </>
              ) : choice ? (
                dagger.wrong
              ) : (
                <ProofUnderline>{dagger.wrong}</ProofUnderline>
              )}
              {dagger.after}
            </p>
          </div>
          <div className="b-landing-choice-pass" aria-hidden="true" key={replayKey}>
            <span className={choice ? 'b-pass' : undefined} />
            <span className={choice ? 'b-pass [--b-i:1] [--b-origin:right]' : undefined} />
          </div>
          <div className="b-landing-choice-line">
            <p className="b-label font-bold">{changedWiki ? '위키 예시' : '위키 원문'}</p>
            {changedWiki ? (
              <p className="b-quote">
                도윤서는 단검을{' '}
                <ProofStrike replayKey={replayKey} className="b-landing-wiki-strike">
                  오른손
                </ProofStrike>{' '}
                <HandNote replayKey={replayKey} delay={420}>
                  왼손
                </HandNote>
                에 쥔다.
              </p>
            ) : (
              <blockquote className="b-quote b-quote--wiki">{dagger.quote}</blockquote>
            )}
          </div>
          <div className="b-landing-panel-head border-t border-ink pt-1">
            <span role="status" className="b-label font-bold">
              {choice?.status ?? '열린 지적 1건'}
            </span>
            <button
              type="button"
              className="b-landing-more"
              onClick={() => setChoice(null)}
              aria-disabled={!choice}
            >
              처음으로
            </button>
          </div>
        </div>
      </div>
      <aside {...factsEntrance} className="b-landing-facts" id="b-facts">
        <span className="b-landing-facts-back b-parallax b-decor" aria-hidden="true" />
        <span
          className="b-landing-facts-back b-landing-facts-back-fast b-parallax b-decor"
          aria-hidden="true"
        />
        <div className="b-paper b-landing-facts-card relative bg-paper">
          <h3 className="b-subhead">설정이라고 다 같은 무게는 아니니까요.</h3>
          <dl className="my-4 divide-y divide-ink border-y border-ink">
            {factStates.map(({ label, text, rule }) => (
              <div key={label} className="py-3">
                <dt
                  className={`inline-flex items-center gap-2 border-b-2 border-ink pb-1 font-bold ${rule}`}
                >
                  <span className="b-dot" aria-hidden="true" />
                  {label}
                </dt>
                <dd className="mt-1">{text}</dd>
              </div>
            ))}
          </dl>
          <Disclosure title="승인 대기" className="b-landing-approval">
            <div className="space-y-2 px-3 pt-3">
              <p>
                완료를 누르는 순간 점검이 돌아가요. 원고에서 새로 나온 설정은 승인 대기로 가고요.
              </p>
              <p>
                AI가 위키를 혼자 고치는 일은 없어요. 작가님이 승인한 것만 들어가요. 누가 언제 무엇을
                바꿨는지는 이력에서 다 볼 수 있어요.
              </p>
            </div>
          </Disclosure>
        </div>
      </aside>
    </ColorBand>
  )
}
