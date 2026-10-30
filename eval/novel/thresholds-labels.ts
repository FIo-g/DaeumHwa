// Hand labels for the threshold replay (eval/novel/thresholds.ts). Each row is taken from a
// review file that a reader wrote for a saved run; `source` names that review file and line.
// A review that says nothing about an item leaves it unlabeled. Unlabeled hits are counted,
// never counted as wrong. Strings are matched byte for byte against the saved texts.

/** Runs of the six saved 2026-10-18 one-chapter runs used as the replay sample. */
export const DEFAULT_RUNS: readonly string[] = [
  'run-01-ko',
  'run-01-en',
  'run-04-ko',
  'run-04-en',
  'run-05-ko',
  'run-05-en',
]

/** A repeated word a review calls a defect (`flag`) or leaves as a required event (`ignore`). */
export type RepeatLabel = {
  run: string
  words: string[]
  expect: 'flag' | 'ignore'
  source: string
}

/** A draft sentence a review names as copied from a style example; matched by prefix. */
export type CopyLabel = { run: string; sentence: string; source: string }

/** Two facts on one card a review names as duplicates (`dup`) or as overlapping (`soft`). */
export type DupLabel = {
  run: string
  a: string
  b: string
  kind: 'dup' | 'soft'
  source: string
}

export const REPEAT_LABELS: readonly RepeatLabel[] = [
  { run: 'run-01-ko', words: ['오른손', '왼손'], expect: 'flag', source: 'qwen3.8-27b-ko.md:156' },
  { run: 'run-01-en', words: ['left hand'], expect: 'flag', source: 'qwen3.8-27b-en.md:64' },
  { run: 'run-04-en', words: ['left hand'], expect: 'flag', source: 'haiku-5.5-en.md:34' },
  { run: 'run-05-en', words: ['left hand'], expect: 'flag', source: 'luna-6-en.md:64' },
  { run: 'run-05-ko', words: ['왼손'], expect: 'ignore', source: 'luna-6-ko.md:139' },
  { run: 'run-04-ko', words: ['왼손'], expect: 'ignore', source: 'haiku-5.5-ko.md:59' },
]

export const COPY_LABELS: readonly CopyLabel[] = [
  {
    run: 'run-01-ko',
    sentence: '안개가 계단을 반쯤 삼키고 있었다.',
    source: 'qwen3.8-27b-ko.md:165',
  },
  {
    run: 'run-04-ko',
    sentence: '쇠가 손바닥에 달라붙을 만큼 차가워서',
    source: 'haiku-5.5-ko.md:118',
  },
  {
    run: 'run-04-en',
    sentence: 'The iron was cold enough to stick to her palm, and when',
    source: 'haiku-5.5-en.md:35',
  },
  {
    run: 'run-05-ko',
    sentence: '한 손으로 난간을 짚자 차가운 쇠가 손금 사이에 달라붙었다.',
    source: 'luna-6-ko.md:56',
  },
  {
    run: 'run-05-en',
    sentence: 'She kept her left hand on the railing as she climbed.',
    source: 'luna-6-en.md:68',
  },
  {
    run: 'run-05-en',
    sentence: 'The iron felt cold enough to pull the heat from her palm.',
    source: 'luna-6-en.md:68',
  },
  {
    run: 'run-05-en',
    sentence: 'Its lower rim shivered once against the gray light.',
    source: 'luna-6-en.md:68',
  },
]

export const DUP_LABELS: readonly DupLabel[] = [
  // qwen3.8-27b, English
  {
    run: 'run-01-en',
    a: "The Bell Tower's bell sometimes",
    b: 'The bell sometimes trembles',
    kind: 'dup',
    source: 'qwen3.8-27b-en.md:119',
  },
  {
    run: 'run-01-en',
    a: "Serin's central goal is to get beneath",
    b: "Serin gathers the key's rule",
    kind: 'dup',
    source: 'qwen3.8-27b-en.md:119',
  },
  {
    run: 'run-01-en',
    a: 'Baek Jiwon blocks Serin from reaching',
    b: 'Baek Jiwon blocks Serin from the entrance',
    kind: 'dup',
    source: 'qwen3.8-27b-en.md:119',
  },
  {
    run: 'run-01-en',
    a: 'What Serin loses permanently',
    b: 'What Serin would lose permanently',
    kind: 'dup',
    source: 'qwen3.8-27b-en.md:119',
  },
  // haiku-5.5, English
  {
    run: 'run-04-en',
    a: 'Fits a lock only on a night when the moon is full.',
    b: 'Fits a lock only on a night when the moon is full and',
    kind: 'dup',
    source: 'haiku-5.5-en.md:86',
  },
  {
    run: 'run-04-en',
    a: 'Does not fit into the keyhole',
    b: 'Fits a lock only on a night when the moon is full and',
    kind: 'dup',
    source: 'haiku-5.5-en.md:86',
  },
  {
    run: 'run-04-en',
    a: 'Fits a lock only on a night when the moon is full.',
    b: 'Does not fit into the keyhole',
    kind: 'dup',
    source: 'haiku-5.5-en.md:86',
  },
  {
    run: 'run-04-en',
    a: 'Asked Do Yunseo to bring',
    b: 'Han Seoyeon sent a sealed letter',
    kind: 'dup',
    source: 'haiku-5.5-en.md:87',
  },
  // luna-6, English
  {
    run: 'run-05-en',
    a: 'It has one thin scratch.',
    b: 'The key has one thin scratch.',
    kind: 'dup',
    source: 'luna-6-en.md:123',
  },
  {
    run: 'run-05-en',
    a: 'The key has one thin scratch.',
    b: 'The key has one thin scratch along',
    kind: 'dup',
    source: 'luna-6-en.md:123',
  },
  {
    run: 'run-05-en',
    a: 'It has one thin scratch.',
    b: 'The key has one thin scratch along',
    kind: 'dup',
    source: 'luna-6-en.md:123',
  },
  {
    run: 'run-05-en',
    a: 'It only fits a lock',
    b: 'The Silver Key fits the lock only',
    kind: 'dup',
    source: 'luna-6-en.md:123',
  },
  {
    run: 'run-05-en',
    a: 'It only fits a lock',
    b: 'The key will enter its lock',
    kind: 'dup',
    source: 'luna-6-en.md:123',
  },
  {
    run: 'run-05-en',
    a: 'The Silver Key fits the lock only',
    b: 'The key will enter its lock',
    kind: 'dup',
    source: 'luna-6-en.md:123',
  },
  {
    run: 'run-05-en',
    a: 'She resents her mother somewhat',
    b: 'She acts calm on the surface',
    kind: 'dup',
    source: 'luna-6-en.md:123',
  },
  {
    run: 'run-05-en',
    a: 'Her goal is to find out why her mother went beneath',
    b: 'Serin wants to get beneath the bell tower',
    kind: 'soft',
    source: 'luna-6-en.md:123',
  },
  // haiku-5.5, Korean
  {
    run: 'run-04-ko',
    a: '종루 지하 입구를 찾으려고',
    b: '열쇠의 규칙과 소문을 모아',
    kind: 'dup',
    source: 'haiku-5.5-ko.md:196',
  },
  {
    run: 'run-04-ko',
    a: '규칙을 앞세워',
    b: '규칙을 내세워 허락 없이는',
    kind: 'dup',
    source: 'haiku-5.5-ko.md:196',
  },
  {
    run: 'run-04-ko',
    a: '한서연에게 은화 서른 닢을 빌린',
    b: '한서연에게 은화 서른 닢을 빌렸다',
    kind: 'dup',
    source: 'haiku-5.5-ko.md:196',
  },
  {
    run: 'run-04-ko',
    a: '감시관이다',
    b: '잿빛 종루의 감시관이다',
    kind: 'dup',
    source: 'haiku-5.5-ko.md:196',
  },
  {
    run: 'run-04-ko',
    a: '공손한 말투 속에 비꼼이 있고',
    b: "한세린을 '아가씨'라고",
    kind: 'dup',
    source: 'haiku-5.5-ko.md:196',
  },
  // luna-6, Korean
  {
    run: 'run-05-ko',
    a: '5화부터 잿빛 종루 1층',
    b: '5화부터 종루 1층',
    kind: 'dup',
    source: 'luna-6-ko.md:130',
  },
  {
    run: 'run-05-ko',
    a: '청해항 부둣가 언덕 아래에 있는 낡은 2층 고아원',
    b: '고아원에서 자랐다.',
    kind: 'dup',
    source: 'luna-6-ko.md:142',
  },
  {
    run: 'run-05-ko',
    a: '종루의 봉인을 연구하다가 3년 전에',
    b: '3년 전에 종루 지하로 내려간',
    kind: 'dup',
    source: 'luna-6-ko.md:130',
  },
]
