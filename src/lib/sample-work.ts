import type { EntryKind, Importance } from '@/db/types'

export type SampleWorkData = {
  title: string
  genre: string
  logline: string
  entries: {
    key: string
    name: string
    kind: EntryKind
    aliases: string[]
    summary: string
  }[]
  facts: { entryKey: string; content: string }[]
  chapters: { title: string; body: string }[]
  threads: {
    title: string
    description: string
    status: 'planned' | 'planted'
    plantedChapter: number | null
    targetChapterPosition: number
    importance: Importance
  }[]
  plantedErrors: { chapter: number; quote: string }[]
  landingChapter: 3
}

/** The one-click demo work. Its manuscript and facts mirror eval/fixtures/continuity-planted. */
export const SAMPLE_WORK: SampleWorkData = {
  title: '잿빛 종루 (샘플)',
  genre: '판타지',
  logline: '어머니의 편지를 쫓아 항구 도시에 온 소녀 세린의 이야기.',
  entries: [
    {
      key: 'serin',
      name: '한세린',
      kind: 'character',
      aliases: ['세린'],
      summary: '청해항 고아원에서 자란 소녀. 어머니의 편지를 쫓는다.',
    },
    {
      key: 'doyunseo',
      name: '도윤서',
      kind: 'character',
      aliases: ['윤서'],
      summary: '청해항 출신의 검사. 말수가 적다.',
    },
    {
      key: 'jongru',
      name: '잿빛 종루',
      kind: 'place',
      aliases: ['종루'],
      summary: '항구 북쪽 언덕 위의 석조 탑.',
    },
    {
      key: 'key',
      name: '은색 열쇠',
      kind: 'item',
      aliases: ['열쇠'],
      summary: '어머니의 유품. 창고 자물쇠를 여는 데 쓰인다.',
    },
    {
      key: 'harbor',
      name: '청해항',
      kind: 'place',
      aliases: [],
      summary: '남쪽 바다에 면한 항구 도시.',
    },
  ],
  facts: [
    { entryKey: 'serin', content: '한세린의 나이는 16살이다.' },
    { entryKey: 'doyunseo', content: '도윤서는 단검을 오른손에 쥔다.' },
    { entryKey: 'jongru', content: '잿빛 종루는 9층 높이의 석조 건물이다.' },
    { entryKey: 'key', content: '은색 열쇠는 달이 찬 밤에만 자물쇠에 꽂을 수 있다.' },
    { entryKey: 'harbor', content: '청해항 시장은 낮에만 문을 연다.' },
  ],
  chapters: [
    {
      title: '청해항 입항',
      body: '청해항에 도착한 세린은 시장 골목을 걸었다. 아침 바람에 비린내가 섞여 있었고, 상인들은 저마다 큰 목소리로 물건을 외치고 있었다. 세린은 어머니가 남긴 편지를 품에 넣은 채 사람들 사이를 천천히 지나갔다. 편지의 봉인은 아직 뜯지 않았다. 골목 끝에는 오래된 우물이 있었고, 그 옆에 낡은 나무 간판이 기울어져 걸려 있었다. 간판에는 바다 그림이 희미하게 남아 있었지만 글자는 거의 읽을 수 없었다. 세린은 간판을 올려다보다가 고개를 저었다. 지금은 편지를 읽을 때가 아니었다. 먼저 이 항구에서 잠잘 곳을 구해야 했다. 등 뒤에서 누군가 그녀의 이름을 부르는 듯했지만, 뒤돌아보니 짐을 실은 수레만 지나가고 있었다. 세린은 짧게 숨을 고르고 다시 걸음을 옮겼다. 하늘은 흐렸고, 항구에 정박한 배들의 돛이 바람에 느리게 흔들렸다. 세린은 가진 돈을 한 번 더 세어 보았다. 충분하지 않았지만 하룻밤은 버틸 수 있을 것 같았다. 그녀는 골목을 빠져나가 큰길로 나섰다. 길가의 상점마다 젖은 생선 냄새가 가득했고, 아이들이 뛰어다니며 웃고 있었다.',
    },
    {
      title: '잿빛 종루 아래',
      body: '해가 기울 무렵 세린은 낡은 여관의 계단을 올라갔다. 복도 끝 방문 앞에는 누군가 두고 간 등불이 흔들리고 있었다. 19살의 세린은 말없이 고개를 숙였다. 문을 연 주인은 그녀의 옷차림을 한참 살피더니 값을 먼저 치르라고 말했다. 세린은 품에서 은화 두 닢을 꺼내 탁자 위에 올려놓았다. 주인은 은화를 저울에 올려보고는 방 번호가 적힌 나무 패를 건넸다. 세린은 나무 패를 손에 꼭 쥐고 방으로 들어갔다. 창밖으로 멀리 잿빛 종루의 그림자가 보였다. 종루는 밤이 되어도 불을 켜지 않았다. 세린은 창문을 닫고 침대 끝에 앉아 편지를 다시 꺼냈다. 봉인에는 바다의 상징인 물결 무늬가 찍혀 있었다. 그녀는 봉인을 손끝으로 쓸어 보다가 편지를 도로 접었다. 방 안은 좁았지만 창문이 높아 바람이 잘 통했다. 세린은 신발을 벗고 벽에 등을 기댔다. 오늘 하루 동안 있었던 일들이 천천히 머릿속에서 정리되었다. 어머니가 사라진 날의 기억은 여전히 흐릿했다.',
    },
    {
      title: '열한 층',
      body: '아침 일찍 세린은 항구 북쪽의 언덕길을 올랐다. 길 끝에는 돌로 쌓은 높은 탑이 서 있었고, 사람들은 그곳을 그냥 탑이라고 불렀다. 종루지기가 열한 층 꼭대기에서 손을 흔들었다. 세린은 그 손짓이 무슨 뜻인지 알 수 없어 걸음을 멈췄다. 언덕 아래에서는 바다가 넓게 펼쳐져 보였다. 배들이 천천히 항구를 빠져나가고 있었고, 바람은 차갑고 짰다. 윤서는 왼손에 단검을 쥐고 문 앞에 섰다. 그의 눈은 탑 안쪽의 어둠을 천천히 훑고 있었다. 세린이 다가가자 그는 말없이 고개만 끄덕였다. 두 사람은 한동안 아무 말도 하지 않았다. 문틈에서 쇠가 긁히는 소리가 길게 울렸다. 세린은 숨을 죽이고 그 소리를 세었다. 탑의 입구는 좁고 어두웠다. 바닥에는 오래된 발자국들이 겹겹이 찍혀 있었고, 벽에는 누군가 긁어 놓은 표식이 남아 있었다. 세린은 그 표식들을 하나씩 눈으로 따라 읽었다.',
    },
  ],
  threads: [
    {
      title: '어머니의 편지',
      description: '세린이 품은 편지. 봉인은 아직 뜯지 않았다.',
      status: 'planted',
      plantedChapter: 1,
      targetChapterPosition: 5,
      importance: 'high',
    },
    {
      title: '불 꺼진 종루',
      description: '종루는 밤이 되어도 불을 켜지 않는다. 이유는 아직 모른다.',
      status: 'planted',
      plantedChapter: 2,
      targetChapterPosition: 2,
      importance: 'medium',
    },
    {
      title: '탑 벽의 표식',
      description: '탑 입구 벽에 누군가 긁어 놓은 표식.',
      status: 'planned',
      plantedChapter: null,
      targetChapterPosition: 6,
      importance: 'low',
    },
  ],
  plantedErrors: [
    { chapter: 2, quote: '19살의 세린은 말없이 고개를 숙였다' },
    { chapter: 3, quote: '종루지기가 열한 층 꼭대기에서 손을 흔들었다' },
    { chapter: 3, quote: '윤서는 왼손에 단검을 쥐고 문 앞에 섰다' },
  ],
  landingChapter: 3,
}
