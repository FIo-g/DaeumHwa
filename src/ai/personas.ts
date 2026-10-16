// Default reader personas for the reader simulation (spec F11). Code constants, not stored rows.

export type Persona = { id: string; name: string; description: string }

export const READER_PERSONAS: Persona[] = [
  {
    id: 'reader-novice',
    name: '신규 유입 독자',
    description: '이번 화부터 처음 읽는다. 설명 없는 인물과 용어에 헷갈린다.',
  },
  {
    id: 'reader-binge',
    name: '정주행 독자',
    description: '1화부터 꼼꼼히 읽어 왔다. 설정 오류와 늘어지는 전개에 민감하다.',
  },
  {
    id: 'reader-casual',
    name: '가볍게 보는 독자',
    description: '출퇴근길 휴대폰으로 빠르게 넘긴다. 긴 설명과 느린 도입에서 이탈한다.',
  },
  {
    id: 'reader-genre',
    name: '장르 매니아',
    description: '장르 클리셰를 잘 안다. 뻔한 전개에 지루해하고 신선한 반전을 원한다.',
  },
]
