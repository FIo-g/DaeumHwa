import { SAMPLE_WORK } from '@/lib/sample-work'

const marks = [
  { id: 'tower', chapter: 3, wrong: '열한 층', entryKey: 'jongru', note: '아홉 층!' },
  { id: 'dagger', chapter: 3, wrong: '왼손', entryKey: 'doyunseo', note: '오른손이에요' },
  { id: 'age', chapter: 2, wrong: '19살', entryKey: 'serin', note: null },
]

export const findings = marks.map((mark, index) => {
  const sentence = SAMPLE_WORK.plantedErrors.find(
    (error) => error.chapter === mark.chapter && error.quote.includes(mark.wrong),
  )
  const fact = SAMPLE_WORK.facts.find((item) => item.entryKey === mark.entryKey)
  const entry = SAMPLE_WORK.entries.find((item) => item.key === mark.entryKey)
  if (!sentence || !fact || !entry) throw new Error(`Missing sample finding: ${mark.id}`)

  const [before, after] = sentence.quote.split(mark.wrong)
  return {
    ...mark,
    number: index + 1,
    before,
    after: `${after}.`,
    quote: fact.content,
    citation: `${entry.name} 카드에 확정해 둔 설정`,
  }
})

export type Finding = (typeof findings)[number]

const episodeExcerpts = [
  {
    number: 3,
    excerpt: '이른 아침, 세린은 항구 북쪽 언덕길을 올랐다.',
  },
  {
    number: 2,
    excerpt: '해가 기울 무렵, 세린은 삐걱거리는 여관 계단을 올랐다.',
  },
  {
    number: 1,
    excerpt: '청해항의 아침은 비린내부터 밀려왔다.',
  },
] as const

export const episodes = episodeExcerpts.map((episode) => ({
  ...episode,
  title: SAMPLE_WORK.chapters[episode.number - 1].title,
}))

export const sampleCaption = '샘플 작품 「잿빛 종루」 3화'
