// Naming rules shared by every extraction system prompt (interview, chapter check, import), and
// the role words that code treats as never being a name. Pure module: no DB, no AI calls.

export const ROLE_WORDS = [
  '주인공',
  '남주',
  '여주',
  '남자 주인공',
  '여자 주인공',
  '악역',
  '조연',
  '화자',
  '나',
  '그',
  '그녀',
  '그들',
] as const

export const ENTITY_NAME_RULES = [
  '- 이름(name)에는 고유 이름만 쓴다. 직업·직함·수식어는 이름에 넣지 않고 summary나 fields에 넣는다. 예: "전직 시계탑 수리공 노은하" → name "노은하", summary "전직 시계탑 수리공".',
  '- summary는 그 카드의 대상 자신에 대한 설명이다. 다른 인물과의 관계를 적을 때 주어를 바꾸지 않는다. 예: "한기준은 전전대 관리자였고 한시우는 그의 아들이다" → 한기준 summary "전전대 관리자", 한시우 summary "한기준의 아들".',
  `- "${ROLE_WORDS.join('", "')}" 같은 역할어와 대명사는 이름이 아니다. 그것을 entries의 name, facts의 subjectName, relations의 양 끝에 쓰지 않고 그 인물의 이름을 쓴다.`,
  '- 답에 이름이 없으면 카드를 만들지 않는다.',
  '- <known>에서 "(승인 대기)"로 표시된 이름은 이미 승인을 기다리는 카드다. 같은 대상이면 그 이름을 그대로 쓰고 새 카드를 만들지 않는다.',
].join('\n')
