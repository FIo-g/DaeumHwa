// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CardRail,
  CardStack,
  ColorBand,
  Disclosure,
  DotMeter,
  HandNote,
  MenuIcon,
  MenuSheet,
  PopButton,
  PopLink,
  ProofRing,
  ProofStrike,
  ProofUnderline,
  ReadingProgress,
  Reveal,
  ScanLine,
  Stagger,
  TiltCard,
  usePrefersReducedMotion,
  useReplay,
} from './index'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function matchMotion(matches: boolean) {
  const callback = new EventTarget()
  const query = Object.assign(callback, { matches })
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(query))
  return query
}

describe('entrances and surfaces', () => {
  it('server-renders Reveal text with no hidden state and activates the observer fallback once', () => {
    matchMotion(false)
    vi.stubGlobal('CSS', { supports: () => false })
    const view = (
      <Reveal direction="left" delay={70} range="entry 0% cover 50%">
        설정 보드
      </Reveal>
    )
    expect(renderToString(view)).toContain('설정 보드')
    const watch = vi.fn()
    const disconnect = vi.fn()
    let notify: IntersectionObserverCallback | undefined
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = callback
        }
        observe = watch
        disconnect = disconnect
      },
    )
    render(view)
    const heading = screen.getByText('설정 보드')
    expect(heading).toHaveAttribute('data-revealed', 'false')
    expect(heading.style.getPropertyValue('--b-reveal-range')).toBe('entry 0% cover 50%')
    expect(heading.style.getPropertyValue('--b-reveal-x')).toBe('32px')
    expect(heading.style.getPropertyValue('--b-delay')).toBe('70ms')
    expect(watch).toHaveBeenCalledWith(heading)
    act(() =>
      notify?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
    )
    expect(heading).toHaveAttribute('data-revealed', 'true')
    expect(disconnect).toHaveBeenCalled()
  })

  it('leaves Reveal content visible without attaching an observer in reduced motion', () => {
    matchMotion(true)
    const observe = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observe
        disconnect() {}
      },
    )
    render(<Reveal decorative>잿빛 종루</Reveal>)
    expect(screen.getByText('잿빛 종루')).toBeVisible()
    expect(observe).not.toHaveBeenCalled()
  })

  it('caps Stagger at six delay positions and retains every child', () => {
    const { container } = render(
      <Stagger>
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i}>장면 {i}</span>
        ))}
      </Stagger>,
    )
    const items = container.firstElementChild?.children
    expect(items).toHaveLength(8)
    expect((items?.[1] as HTMLElement).style.getPropertyValue('--b-i')).toBe('1')
    expect((items?.[7] as HTMLElement).style.getPropertyValue('--b-i')).toBe('5')
  })

  it('renders a semantic ColorBand with app spacing and a bounded inner wrapper', () => {
    render(
      <ColorBand color="sand" density="app" aria-label="근거" innerClassName="gap-4">
        근거 카드
      </ColorBand>,
    )
    expect(screen.getByRole('region', { name: '근거' })).toHaveClass('b-band--sand', 'b-band--app')
    expect(screen.getByText('근거 카드')).toHaveClass('b-wrap', 'gap-4')
  })

  it('keeps the TiltCard focus target separate and assigns stack angles', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <>
        <TiltCard>
          <button>다시 보기</button>
        </TiltCard>
        <CardStack>
          <span>겨자</span>
          <span>잎</span>
          <span>살구</span>
        </CardStack>
      </>,
    )
    await user.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    expect(screen.getByRole('button').closest('.b-card')).toHaveAttribute('data-pointer', 'true')
    expect(
      [...container.querySelector('.b-card-stack')!.children].map((card) => card.className),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('b-card--first'),
        expect.stringContaining('b-card--middle'),
        expect.stringContaining('b-card--last'),
      ]),
    )
  })
})

describe('actions', () => {
  it('activates PopButton from the keyboard and blocks pending activation', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { rerender } = render(
      <PopButton onClick={onClick} size="large">
        점검하기
      </PopButton>,
    )
    await user.tab()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByRole('button')).toHaveClass('b-button--primary', 'b-button--shadow')
    expect(screen.getByRole('button')).toHaveAttribute('data-size', 'large')
    rerender(
      <PopButton onClick={onClick} pending pendingLabel="점검 중">
        점검하기
      </PopButton>,
    )
    const pending = screen.getByRole('button', { name: '점검 중' })
    expect(pending).toBeDisabled()
    expect(pending).toHaveAttribute('aria-busy', 'true')
  })

  it('renders separate PopLink faces and removes the inactive destination', () => {
    const { rerender } = render(
      <PopLink href="/works" variant="sand">
        내 작품
      </PopLink>,
    )
    const link = screen.getByRole('link', { name: '내 작품' })
    expect(link).toHaveAttribute('href', '/works')
    expect(link).toHaveClass('b-button--sand')
    expect(link.querySelector('.b-button__arrow')).toHaveAttribute('aria-hidden', 'true')
    rerender(
      <PopLink href="/works" disabled>
        내 작품
      </PopLink>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('link')).not.toHaveAttribute('href')
  })

  it('opens Disclosure with the keyboard and makes closed content inert immediately', async () => {
    const user = userEvent.setup()
    render(
      <Disclosure title="위키 원문">
        <a href="#evidence">근거</a>
      </Disclosure>,
    )
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(trigger.getAttribute('aria-controls')!)).toHaveAttribute('inert')
    await user.tab()
    await user.keyboard('{Enter}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region')).not.toHaveAttribute('inert')
    expect(screen.getByRole('link', { name: '근거' })).toBeVisible()
    await user.keyboard(' ')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: '근거' })).toBeNull()
  })

  it('renders the menu icon as a decorative X when open', () => {
    const { container } = render(<MenuIcon open />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveClass('b-menu-icon--close')
    expect(svg?.querySelectorAll('line')).toHaveLength(2)
  })

  it('opens MenuSheet, closes with the button and Escape, and returns focus', async () => {
    const user = userEvent.setup()
    render(
      <MenuSheet title="작품 메뉴">
        <a href="#notes">설정 보드</a>
      </MenuSheet>,
    )
    const trigger = screen.getByRole('button', { name: '메뉴 열기' })
    await user.tab()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: '작품 메뉴' })
    const close = within(dialog).getByRole('button', { name: '메뉴 닫기' })
    await waitFor(() => expect(close).toHaveFocus())
    expect(within(dialog).getByRole('link', { name: '설정 보드' })).toBeVisible()
    await user.click(close)
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog')).toBeVisible()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('proof and scroll', () => {
  it.each([ProofRing, ProofUnderline, ProofStrike])(
    'replays only the decorative SVG for %p',
    (Mark) => {
      const { rerender } = render(<Mark replayKey={0}>열한 층</Mark>)
      const phrase = screen.getByText('열한 층')
      const first = phrase.querySelector('svg')
      expect(first).toHaveAttribute('aria-hidden', 'true')
      expect(first?.querySelector('path')).toHaveAttribute('pathLength', '100')
      rerender(<Mark replayKey={1}>열한 층</Mark>)
      expect(screen.getByText('열한 층')).toBe(phrase)
      expect(phrase.querySelector('svg')).not.toBe(first)
    },
  )

  it('replays the handwriting and scan while leaving note text readable on the server', () => {
    expect(renderToString(<HandNote>다시 확인</HandNote>)).toContain('다시 확인')
    const { container, rerender } = render(
      <>
        <HandNote replayKey={0}>다시 확인</HandNote>
        <ScanLine replayKey={0} />
      </>,
    )
    const note = screen.getByText('다시 확인')
    const scan = container.querySelector('.b-scan-line')
    rerender(
      <>
        <HandNote replayKey={1}>다시 확인</HandNote>
        <ScanLine replayKey={1} />
      </>,
    )
    expect(screen.getByText('다시 확인')).not.toBe(note)
    expect(container.querySelector('.b-scan-line')).not.toBe(scan)
    rerender(<ScanLine active={false} />)
    expect(container.querySelector('.b-scan-line')).toBeNull()
  })

  it('responds to reduced-motion preference changes and increments the replay key', () => {
    const query = matchMotion(false)
    const { result } = renderHook(() => ({ reduced: usePrefersReducedMotion(), ...useReplay() }))
    expect(result.current.reduced).toBe(false)
    act(() => {
      query.matches = true
      query.dispatchEvent(new Event('change'))
      result.current.replay()
    })
    expect(result.current).toMatchObject({ reduced: true, replayKey: 1 })
  })

  it('measures an explicit scroll source and fills dots without animation under reduced motion', () => {
    matchMotion(true)
    function Reader() {
      const ref = useRef<HTMLDivElement>(null)
      return (
        <div ref={ref} data-testid="reader">
          <ReadingProgress scrollRef={ref} />
          <DotMeter scrollRef={ref} count={4} />
        </div>
      )
    }
    const { container } = render(<Reader />)
    const reader = screen.getByTestId('reader')
    Object.defineProperties(reader, {
      scrollHeight: { value: 300 },
      clientHeight: { value: 100 },
      scrollTop: { value: 100, writable: true },
    })
    fireEvent.scroll(reader)
    expect(container.querySelector('.b-progress__fill')).toHaveAttribute('data-measured', 'true')
    expect(
      (container.querySelector('.b-progress__fill') as HTMLElement).style.getPropertyValue(
        '--b-progress',
      ),
    ).toBe('0.5')
    const meter = screen.getByRole('progressbar', { name: '읽기 진행' })
    expect(meter).toHaveAttribute('aria-valuenow', '50')
    expect(meter.querySelectorAll('[data-filled="true"]')).toHaveLength(2)
  })

  it('moves CardRail from a focused rail via arrow keys and uses an instant reduced-motion scroll', () => {
    matchMotion(true)
    render(
      <CardRail>
        <div>1화</div>
        <div>2화</div>
      </CardRail>,
    )
    const rail = screen.getByRole('region', { name: '카드 목록' })
    Object.defineProperties(rail, { clientWidth: { value: 100 }, scrollWidth: { value: 300 } })
    const scrollTo = vi.fn()
    Object.defineProperty(rail, 'scrollTo', { value: scrollTo })
    fireEvent.scroll(rail)
    expect(screen.getByRole('button', { name: '이전 카드' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '다음 카드' })).toBeEnabled()
    fireEvent.keyDown(rail, { key: 'ArrowRight' })
    expect(scrollTo).toHaveBeenCalledWith({ left: 200, behavior: 'instant' })
  })
})
