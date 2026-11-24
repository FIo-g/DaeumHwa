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
  CountCell,
  Disclosure,
  DotMeter,
  GridTitle,
  MarginNote,
  MenuIcon,
  MenuSheet,
  PopButton,
  PopLink,
  ProofPair,
  ProofRing,
  ProofStrike,
  ProofUnderline,
  ReadingProgress,
  Reveal,
  ScanLine,
  Sheet,
  Stagger,
  usePrefersReducedMotion,
  useReplay,
} from './index'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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
      <Reveal direction="left" delay={70}>
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
    expect(heading.style.getPropertyValue('--wg-reveal-x')).toBe('4px')
    expect(heading.style.getPropertyValue('--wg-delay')).toBe('70ms')
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
    expect((items?.[1] as HTMLElement).style.getPropertyValue('--wg-index')).toBe('1')
    expect((items?.[7] as HTMLElement).style.getPropertyValue('--wg-index')).toBe('5')
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
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'primary')
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
    expect(link).toHaveAttribute('data-variant', 'sand')
    expect(link.querySelector('.wg-pop-arrow')).toHaveAttribute('aria-hidden', 'true')
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
    expect(svg?.querySelector('line')).toHaveAttribute('y2', '18')
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
  it('replays the ring without replacing the marked word', () => {
    const { rerender } = render(<ProofRing replayKey={0}>열한 층</ProofRing>)
    const phrase = screen.getByText('열한 층')
    const first = phrase.querySelector('svg')
    expect(first).toHaveAttribute('aria-hidden', 'true')
    expect(first?.querySelector('path')).toHaveAttribute('pathLength', '100')
    rerender(<ProofRing replayKey={1}>열한 층</ProofRing>)
    expect(screen.getByText('열한 층')).toBe(phrase)
    expect(phrase.querySelector('svg')).not.toBe(first)
  })

  it.each([ProofUnderline, ProofStrike])(
    'marks flowing text with a per-line rule for %p',
    (Mark) => {
      const text = '종루지기가 열한 층 꼭대기에서 손을 흔들었다.'
      const { rerender } = render(<Mark replayKey={0}>{text}</Mark>)
      const rule = screen.getByText(text)
      const phrase = rule.parentElement
      expect(phrase).toHaveClass('wg-proof-mark')
      expect(rule).toHaveClass('wg-proof-text')
      expect(phrase?.querySelector('svg')).toBeNull()
      rerender(<Mark replayKey={1}>{text}</Mark>)
      expect(screen.getByText(text)).not.toBe(rule)
      expect(screen.getByText(text).parentElement).toBe(phrase)
    },
  )

  it.each([ProofUnderline, ProofRing, ProofStrike])(
    'draws a separate stroke on each wrapped line for %p',
    (Mark) => {
      vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
        this: HTMLElement,
      ) {
        return (this.hasAttribute('data-wg-proof')
          ? [new DOMRect(48, 10, 65, 20), new DOMRect(8, 40, 56, 20)]
          : []) as unknown as DOMRectList
      })
      const { container } = render(<Mark>왼손에 단검을 쥐고</Mark>)
      const strokes = container.querySelectorAll<SVGSVGElement>('.wg-proof-pen')
      expect(strokes).toHaveLength(2)
      expect(strokes[1].style.left).toMatch(/^-/)
      expect(strokes[1]).toHaveAttribute('aria-hidden', 'true')
    },
  )

  it('keeps the SVG for an externally positioned manuscript mark', () => {
    const { container } = render(<ProofUnderline style={{ width: 64, height: 18 }} />)
    expect(container.querySelector('svg')).toHaveClass('wg-proof-pen')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('replays and removes the scan line', () => {
    const { container, rerender } = render(<ScanLine replayKey={0} />)
    const scan = container.querySelector('.wg-scan-line')
    rerender(<ScanLine replayKey={1} />)
    expect(container.querySelector('.wg-scan-line')).not.toBe(scan)
    rerender(<ScanLine active={false} />)
    expect(container.querySelector('.wg-scan-line')).toBeNull()
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
    expect(container.querySelector('.wg-reading-progress-fill')).toHaveAttribute(
      'data-measured',
      'true',
    )
    expect(
      (container.querySelector('.wg-reading-progress-fill') as HTMLElement).style.getPropertyValue(
        '--wg-reading-progress',
      ),
    ).toBe('0.5')
    const meter = screen.getByRole('progressbar', { name: '읽기 진행' })
    expect(meter).toHaveAttribute('aria-valuenow', '50')
    expect(meter.querySelectorAll('[data-filled="true"]')).toHaveLength(2)
  })

  it('hides CardRail controls until the rail overflows and supports instant keyboard scrolling', () => {
    matchMotion(true)
    render(
      <CardRail>
        <div>1화</div>
        <div>2화</div>
      </CardRail>,
    )
    const rail = screen.getByRole('region', { name: '카드 목록' })
    expect(screen.queryByRole('button', { name: '이전 카드' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다음 카드' })).not.toBeInTheDocument()
    const widths = { client: 100, scroll: 300 }
    Object.defineProperties(rail, {
      clientWidth: { get: () => widths.client },
      scrollWidth: { get: () => widths.scroll },
    })
    const scrollTo = vi.fn()
    Object.defineProperty(rail, 'scrollTo', { value: scrollTo })
    fireEvent.scroll(rail)
    expect(screen.getByRole('button', { name: '이전 카드' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '다음 카드' })).toBeEnabled()
    fireEvent.keyDown(rail, { key: 'ArrowRight' })
    expect(scrollTo).toHaveBeenCalledWith({ left: 200, behavior: 'instant' })

    widths.client = 300
    fireEvent.resize(window)
    expect(screen.queryByRole('button', { name: '이전 카드' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다음 카드' })).not.toBeInTheDocument()
  })
})

describe('manuscript paper', () => {
  it('exposes one plain heading and places punctuation and spaces in manuscript cells', () => {
    const { container } = render(
      <GridTitle as="h1" size="page" columns={5}>
        내 작품.
      </GridTitle>,
    )
    const heading = screen.getByRole('heading', { level: 1, name: '내 작품.' })
    expect(within(heading).getByText('내 작품.')).toBeInTheDocument()
    expect(container.querySelector('.wg-title-cells')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('[data-punctuation] [data-letter]')).toHaveAttribute(
      'data-letter',
      '.',
    )
    expect(container.querySelectorAll('[data-letter=""]')).toHaveLength(1)
    expect(container.querySelectorAll('.wg-title-cell')).toHaveLength(5)
    render(<GridTitle>내 작품</GridTitle>)
    expect(screen.getByRole('heading', { name: '내 작품' })).toContainElement(
      screen.getByText('내 작품'),
    )
  })

  it('keeps a word together at the edge and pads the rows to the same width', () => {
    const { container } = render(<GridTitle columns={6}>머릿속 설정집은</GridTitle>)
    const cells = [...container.querySelectorAll('.wg-title-cell')]
    expect(cells).toHaveLength(12)
    expect(cells[6]).toHaveAttribute('data-first')
    expect(cells[6].firstChild).toHaveAttribute('data-letter', '설')
    expect(cells[5]).toBeEmptyDOMElement()
    expect(cells[11]).toBeEmptyDOMElement()
  })

  it('starts the next row with a word when a separator falls at the row break', () => {
    const { container } = render(<GridTitle columns={8}>머릿속 설정집은 접어 두세요.</GridTitle>)
    const cells = container.querySelectorAll('.wg-title-cell')
    expect(cells[8].firstChild).toHaveAttribute('data-letter', '접')
    expect(cells[15]).toBeEmptyDOMElement()
  })

  it('renders Sheet edge marks outside the accessibility tree', () => {
    render(
      <Sheet label="20×10" page={0} ruled aria-label="초고">
        본문
      </Sheet>,
    )
    const sheet = screen.getByRole('region', { name: '초고' })
    const edge = within(sheet).getByText('20×10').parentElement
    expect(edge).toHaveAttribute('aria-hidden', 'true')
    expect(within(sheet).getByText('0')).toBeInTheDocument()
    expect(within(sheet).getByText('본문')).toBeVisible()
    expect(sheet).toHaveAttribute('data-ruled', 'true')
  })

  it('keeps the original wiki quotation in a blockquote with its source', () => {
    render(<MarginNote source="도윤서 카드">도윤서는 단검을 오른손에 쥔다.</MarginNote>)
    expect(screen.getByText('위키 원문')).toBeVisible()
    expect(screen.getByRole('blockquote')).toHaveTextContent('도윤서는 단검을 오른손에 쥔다.')
    expect(screen.getByText('도윤서 카드')).toBeVisible()
  })

  it('keeps both ProofPair columns and connects the first proof mark only', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('wg-proof-pair-note')) return new DOMRect(180, 0, 120, 80)
      if (this.classList.contains('wg-margin-note-quote')) return new DOMRect(195, 34, 100, 22)
      return new DOMRect(0, 0, 300, 80)
    })
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
      this: HTMLElement,
    ) {
      const rects =
        this.dataset.wgProof === 'underline'
          ? [new DOMRect(30, 20, 36, 17)]
          : [new DOMRect(100, 20, 50, 17)]
      return rects as unknown as DOMRectList
    })
    const note = <MarginNote>도윤서는 단검을 오른손에 쥔다.</MarginNote>
    const { container, rerender } = render(
      <ProofPair
        manuscript={
          <p>
            윤서는 <ProofUnderline>왼손</ProofUnderline>에 <ProofRing>단검</ProofRing>을 쥐었다.
          </p>
        }
        note={note}
      />,
    )
    expect(
      within(container.querySelector<HTMLElement>('.wg-proof-pair-manuscript')!).getByText('왼손'),
    ).toBeVisible()
    expect(
      within(container.querySelector<HTMLElement>('.wg-proof-pair-note')!).getByRole('blockquote'),
    ).toBeVisible()
    const leader = container.querySelector('.wg-proof-pair-leader')
    expect(leader).toHaveAttribute('aria-hidden', 'true')
    expect(leader?.querySelector('path')).toHaveAttribute('d', 'M68 37H180L192 43')
    rerender(<ProofPair manuscript="원고만" note={note} />)
    expect(container.querySelector('.wg-proof-pair-leader')).toBeNull()
    expect(screen.getByText('원고만')).toBeVisible()
  })

  it('exposes only the final CountCell value and unit with reduced motion', () => {
    matchMotion(true)
    const { container } = render(<CountCell value={7} unit="건" />)
    expect(screen.getByText('7건')).not.toHaveAttribute('aria-hidden')
    expect(container.querySelector('.wg-count-face')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.wg-count-value')).toHaveAttribute('data-value', '7')
    expect(container.querySelector('.wg-count-value')).not.toHaveAttribute('data-counting')
  })
})
