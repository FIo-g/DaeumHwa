import type { CSSProperties, ReactNode } from 'react'
import { CheckIcon, FileTextIcon, ScanLineIcon } from 'lucide-react'

const STAGES = ['올리기', '나누기', '설정 추출', '승인 대기']

export function ImportStages({
  stage,
  running = false,
  children,
}: {
  stage: 1 | 2 | 3 | 4
  running?: boolean
  children: ReactNode
}) {
  return (
    <ol aria-label="가져오기 단계" className="b-tools-stages">
      {STAGES.map((label, index) => {
        const number = index + 1
        const active = number === stage
        return (
          <li
            key={label}
            className="b-tools-stage"
            data-state={active ? 'current' : number < stage ? 'past' : 'next'}
            aria-current={active ? 'step' : undefined}
          >
            <div className="b-tools-stage-head">
              <span className="b-number" aria-hidden="true">
                {number}
              </span>
              <h2 className={active ? 'b-heading' : 'font-bold'}>{label}</h2>
              {number < stage && <CheckIcon className="ml-auto size-5" aria-label="지난 단계" />}
            </div>
            {active && (
              <>
                <div
                  className="b-tools-stage-art"
                  data-stage={stage}
                  data-running={running}
                  aria-hidden="true"
                >
                  <div className="b-tools-stage-drawing">
                    <span className="b-tools-process-envelope" />
                    <span className="b-tools-process-sheet">
                      <FileTextIcon />
                    </span>
                    <span className="b-tools-process-fragment" />
                    <span className="b-tools-process-fragment" />
                    <span className="b-tools-process-fragment" />
                    {stage >= 3 && (
                      <span className="b-tools-process-symbol">
                        {stage === 3 ? <ScanLineIcon /> : <CheckIcon />}
                      </span>
                    )}
                  </div>
                </div>
                <div className="b-tools-stage-body">{children}</div>
              </>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function ImportMeter({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="b-meter b-tools-import-meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      style={{ '--b-value': value / 100 } as CSSProperties}
    >
      <span className="b-meter__fill" />
    </div>
  )
}
