# 잘 쓴 소설 기준 (다음화 품질 평가용)

작성: 2026-10-18 · 자료 조사 Haiku(Aside 브라우저) · 원문 대조와 종합 Opus

경량 모델 평가 하네스(`docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md`)에서 Sonnet 검토자가 회차 본문을 채점할 때 쓰는 기준이다. 문학상, 공모전, 학술 연구, 공공기관 자료에서 근거를 모았다. 근거 없이 정한 값은 모두 **(설계 판단)**으로 표시했다. 출처의 확인 상태는 5절에 있다.

## 1. 결론

1. **공인된 단일 채점표는 없다.**
   - 노벨 문학상, 부커상, 전미도서상은 "심사위원의 판단"에 맡기고 채점 기준을 문서로 두지 않는다.
   - 기준을 글로 밝힌 곳은 두 군데 정도다.
     - 영국 여성문학상(Women's Prize): 탁월함, 독창성, 접근성
     - 한국 웹소설 공모전: 대중성, 창의성, 완성도, 성실성(또는 발전가능성), 모바일 친화도
2. **측정할 수 있는 항목은 학술 연구가 준다.**
   - HANNA: 기준 6개를 1~5점으로 매긴다.
   - TTCW: 검사 14개를 통과와 불통과로 판정한다.
   - ConStory-Bench: 설정 모순을 5분류 19유형으로 나누고, 1만 단어당 몇 건인지 센다.
3. **국내 신춘문예 심사평이 반복해서 짚는 결함은 AI 글의 약점과 겹친다.**
   - 심사평의 지적은 네 가지다. 관계와 내면 변화를 서사로 보이지 않고 직접 진술한다. 주제를 서술과 대사로 말해 버려 교훈적으로 들린다. 인물의 감정 여정이 성급하게 끝난다. 구조가 평면적이다.
   - TTCW에서 AI가 전문 작가에게 가장 크게 뒤진 항목도 같은 쪽이다. 결말의 자연스러움, 생각의 독창성(클리셰 없음), 관점과 목소리다.
4. **웹소설 형식 관행은 공공 보고서에 정성적으로만 있다.** 짧은 회차, 서론 없이 바로 갈등으로 들어가기, 대화 중심, 간결한 문체, 모바일에서 읽기 쉬움 같은 것들이다.
   - 문단 길이, 대사 비율, 회차 끝 장치(절단신공), 초반 이탈률은 숫자 근거를 찾지 못했다.
   - 회차 분량의 공식 근거는 2021 네이버웹소설 공모전의 "각 회차별 최소 글자수는 공백 포함 5,000자 이상" 하나뿐이었다.
5. **AI 채점자는 작품 하나하나의 절대 점수보다 모델끼리 순위 매기기에 맞다.** 이번 평가의 목적이 모델 비교라서 쓸 수 있다. 다만 근거 인용을 강제하고, 한계를 함께 적는다(4절).
6. 그래서 다음화의 기준은 세 층으로 둔다.
   - **문턱:** 출판할 수 없게 만드는 결함이 없는가
   - **품질 점수:** 9개 항목을 각각 1~5점으로 매긴다
   - **상향 지표:** TTCW 통과율. 참고용이다.

## 2. 출처별로 무엇을 보나

| 출처 | 보는 것 | 다음화 기준에 쓴 곳 |
|---|---|---|
| 노벨 문학상 [1–4] | 유언은 "이상적인 방향으로 가장 뛰어난 작품"이라고만 한다. 위원은 "문학적 수준이 유일한 기준"이고 "다른 데서 들을 수 없는 목소리"를 본다고 말했다. | 직접 쓰지 않았다(기준 문서 없음). Q5 목소리 항목의 배경으로만 쓴다. |
| 부커상 [5] | "가장 뛰어난 지속적인 소설", 판단은 심사위원 몫 | 없음 |
| 여성문학상 [6–7] | 탁월함 = 문장의 질, 독창성 = 관점과 기법, 접근성 = 폭넓은 독자에게 열려 있음 | Q7 문장, Q8 독창성, Q1 몰입 |
| 퓰리처, 전미도서상, 휴고, 네뷸러, 에드거 [8–10] | 자격 요건(국적, 분량, 장르)만 둔다. 품질 기준은 패널 재량이다. | 없음 |
| 웹소설 공모전 [11–13] | 대중성 "서사에 몰입할 수 있는 재미", 창의성 "작품만의 개성", 완성도 "연재 소설로서 적합한 스토리 전개 능력과 문장력", 모바일 친화도. 회차당 공백 포함 5,000자 이상 | Q1, Q6, Q7, Q8, T3 |
| 신춘문예와 문학상 심사평 [14–18] | 안정적인 구조와 문장. 감정 여정을 성급하게 끝냄. 주제를 직접 표현해 교훈적임. 직접 진술. 평면적 구조 | Q2, Q3, Q4 |
| HANNA [19] | 지시 부합, 일관성, 공감, 놀라움, 몰입, 복잡성(1~5점). 사람이 쓴 이야기의 평균은 3.76점 | T1, Q1, Q2, Q4, 출판 기준값 |
| AI 채점 연구 [20] | LLM 채점은 작품 단위로는 사람과 약하게 맞고, 모델 순위는 매우 잘 맞는다 | 4절 채점 방법 |
| TTCW [21] | 검사 14개. 뉴요커 수록작 84.7%, GPT-4 27.9%, Claude v1.3 30.0% 통과 | Q3, Q4, Q5, Q6, Q8, Q9, 상향 지표 |
| EQ-Bench, WritingBench, LitBench [22–24] | 클리셰 회피, 화려한 군더더기와 과한 비유 회피, 지시 준수. 분량은 모델들이 가장 못 지키는 요건이다 | Q7, Q8, T3, T4 |
| ConStory-Bench [25] | 장편 모순 5분류 19유형, 1만 단어당 건수(CED) | T2, 5화 누계 |
| 몰입 척도 [26–27] | 사건이 눈에 그려짐, 정신적으로 빠져듦, 결말이 궁금함, 인물이 선명함 | Q1 |
| 웹소설 연구 [29–33] | 단문, 몰입, 대리만족, 매력적인 주인공. 장르 전형(회귀, 빙의 등)은 결함이 아니라 형식이다 | Q4, Q6, Q8 |
| 출판문화산업진흥원 실태조사 [34–35] | 회차 분량이 제한적이라 빠르고 흥미로운 전개가 필수다. 서론을 최소화한다. 대화 중심의 간결한 문체로 쓴다 | Q6, Q9 |
| 국립국어원 [36–37] | 번역투 패턴: "~에 의해 ~되다", 사물이 주어인 능동문, "~에 있다", "-의" 남용. 피동 과다는 문법 오류가 아니라 문체 문제다 | Q7 |

## 3. 다음화 기준표

### 3.1 문턱: 하나라도 걸리면 "출판 불가"

| id | 기준 | 기준값 | 근거 |
|---|---|---|---|
| T1 | 지시 사건 | 회차 지시문의 사건이 모두 들어 있다. 빠진 사건 0건. 지시문을 한 문장만 준 실행(few)은 설정집 회차의 `mustInclude` 사건 목록(reference/chapter-events.json)으로 센다 | HANNA 지시 부합 [19], 공모전 완성도 [11] |
| T2 | 설정 모순 | 설정집이나 승인된 위키가 적은 사실과 어긋나는 서술 0건. ConStory 분류 4개(Narrative & Style 제외)로 기록한다. 세는 범위는 3.5절 | ConStory-Bench [25] |
| T3 | 분량 | 한국어 공백 포함 5,000자 이상, 목표 분량의 130% 이하. 영어판은 설계서 6.5의 환산 비율을 쓴다 | 네이버 2021 공모전 [11]. 상한은 (설계 판단). 분량은 모델이 가장 못 지키는 요건이다 [23] |
| T4 | 본문 외 내용 | 제목, 해설, "다음은 초안입니다" 같은 메타 발언, 지시문 반복이 0건 | 지시 준수 [22], 앱 초안 규칙 |
| T5 | 언어 섞임 | 한국어판에 외국어 문장이나 깨진 글자가 0건. 영어판도 같다 | (설계 판단) |
| T6 | 맞춤법 | 저장된 본문(맞춤법 반영 후)에서 명백한 맞춤법, 띄어쓰기 오류가 1,000자당 1건 이하 | 국립국어원 [36]. 수치는 (설계 판단) |
| T7 | 잘림 | 문장 중간에서 끊기거나 출력 한도로 잘리지 않았다 | (설계 판단) |

### 3.2 품질 점수: 9개 항목, 1~5점

2점과 4점은 이웃한 두 점수 사이로 본다. 점수마다 본문 인용을 한두 개 붙인다.

**Q1 몰입과 재미**
- 1점: 사건 없이 설명만 이어져 읽기를 멈추고 싶다.
- 3점: 따라 읽히지만 다음이 궁금하지 않다.
- 5점: 장면과 공간이 눈에 그려지고, 다음 화를 바로 누르고 싶다.
- 근거: 공모전 대중성 "서사에 몰입할 수 있는 재미, 흥미 요소가 충분한가" [11], HANNA 몰입 [19], 몰입 척도의 "사건이 눈에 그려진다"와 "결말이 궁금하다" [26], TTCW 감각적 세계 구축 [21]

**Q2 일관성과 짜임**
- 1점: 인과가 끊기고, 누가 무엇을 하는지 헷갈린다.
- 3점: 대체로 통하지만 어색한 비약이 몇 군데 있다.
- 5점: 처음부터 끝까지 앞뒤가 맞고, 요소들이 하나로 맞물린다.
- 근거: HANNA 일관성(1점 "전혀 말이 안 된다", 5점 "처음부터 끝까지 말이 된다") [19], TTCW 이해와 일관성 [21], 서울신문 심사평 "안정적인 구조와 문장" [14]

**Q3 보여 주기 (장면과 진술)**
- 1점: 감정, 관계, 주제를 서술자나 대사가 직접 말한다.
- 3점: 장면과 요약이 섞여 있지만, 핵심 순간 일부를 요약으로 넘긴다.
- 5점: 핵심 순간은 장면으로, 이음새는 요약으로 쓰고, 주제는 행동과 결과로 드러난다.
- 근거: TTCW 장면과 설명의 균형 [21], 서울신문 심사평 "주제가 서술과 대사로 직접 표현되는 후반부가 다소 교훈적" [14], 한국일보 심사평 "서사적 요소보다 직접적 진술로 진행" [16]

**Q4 인물과 감정선**
- 1점: 인물이 줄거리를 옮기는 장치에 그치고, 감정이 이유 없이 바뀐다.
- 3점: 감정은 이해되지만 변화가 급하거나 평면적이다.
- 5점: 내면과 행동이 균형을 이루고, 감정 변화에 계기가 있어 독자가 따라 느낀다. 주인공에게 끌린다.
- 근거: HANNA 공감 [19], TTCW 감정 유연성(내면과 외면의 균형)과 인물 발전("줄거리를 위해서만 존재하는 인물이 없게") [21], 서울신문 심사평 "인물의 감정적 여정이 성급하게 마무리" [14], 웹소설 연구의 매력적인 주인공과 대리만족 [32]

**Q5 인물 목소리**
- 1점: 모든 인물이 같은 말투다.
- 3점: 주인공만 구분된다.
- 5점: 이름을 가려도 누가 말하는지 알 수 있고, 문체 카드의 말투를 지킨다. 문체 카드의 글쓰기 규칙(`rules`)은 Q6~Q8에서 본다(3.5절).
- 근거: TTCW 관점과 목소리(뉴요커 72.2%, GPT-4 16.7% 통과로 격차가 큰 항목) [21], 노벨위원회 "목소리" 발언 [3], 다음화 문체 카드 기능

**Q6 전개와 호흡 (웹소설 형식)**
- 1점: 서론이 길고 사건이 늦게 시작한다. 긴 묘사 문단이 이어진다.
- 3점: 사건은 있으나 늘어지는 구간이 있다.
- 5점: 첫 장면부터 갈등이 움직이고, 시간의 압축과 확장이 알맞다. 대화 중심의 짧은 문단이라 휴대폰에서 읽기 쉽다.
- 근거: TTCW 서사 속도 [21], 실태조사 "서론을 최소화하고 갈등과 사건을 바로 전개"와 "대화 중심의 구성과 간결한 문체" [34], 공모전 모바일 친화도 [11], 웹소설 연구의 "가독성을 고려한 단문 형태의 문장" [31]
- 문단 길이와 대사 비율은 수치 근거가 없어 점수 판단에만 쓰고 문턱으로 두지 않는다.
- 문단의 문장 수는 하네스가 `overlongParagraphs`(3문장 초과 문단 수)로 센다. 점수 판단에만 쓰고 문턱으로 두지 않는다.

**Q7 문장**
- 1점: 비문, 번역투, 같은 표현 반복, 과장된 수사가 많다.
- 3점: 읽히지만 상투적 표현이나 번역투가 눈에 띈다.
- 5점: 정확하고 간결하며, 군더더기 수사 없이 장면이 선명하다.
- 근거: 여성문학상 "excellence in quality of writing" [6], 공모전 완성도 "문장력" [11], EQ-Bench "화려한 군더더기 회피"와 "과한 비유 회피" [22], 국립국어원 번역투 패턴 [36]
- 피동 표현은 많으면 감점하되 문법 오류로 세지 않는다 [37].

**Q8 독창성과 클리셰**
- 1점: 상투적인 문장과 전개로만 이뤄져 있다. 예: "심장이 쿵 내려앉았다"류의 남발
- 3점: 장르 관습을 따르지만 이 작품만의 디테일은 드물다.
- 5점: 장르 관습 안에서도 이 작품만의 디테일, 이미지, 전환이 있다.
- 근거: 공모전 창의성 "작품만의 개성이 돋보이는가" [11], 여성문학상 "originality in perspective and craft" [6], TTCW 생각의 독창성 "클리셰 없는 글"(뉴요커 91.7%, GPT-4 44.4%) [21], EQ-Bench 클리셰 회피 [22]
- 주의: 회귀, 빙의 같은 장르 전형을 따르는 것은 결함이 아니다 [32, 33]. 감점 대상은 문장과 장면 단위의 상투성이다.

**Q9 회차 끝맺음과 다음 화 유인**
- 1점: 갑자기 끊기거나, 사건 없이 흐지부지 끝난다.
- 3점: 자연스럽게 끝나지만 다음 화가 당기지 않는다.
- 5점: 이 화의 사건이 매듭지어지면서, 다음 화로 이어지는 질문이나 긴장이 남는다.
- 근거: TTCW 결말("자연스럽고 납득되는가", 뉴요커 91.7%, GPT-4 19.4%로 격차가 가장 큰 항목) [21], 실태조사 "각 회차에서 빠른 전개와 흥미로운 전개를 유지하는 것이 필수" [34]
- 절단신공은 업계 관행이지만 수치 근거는 없다.

### 3.3 기준값

- **출판 가능:** 아래 셋을 모두 만족해야 한다.
  - 문턱 T1~T7을 모두 통과한다.
  - 품질 점수 평균이 3.75점 이상이다.
  - 2점 이하인 항목이 없다.
  - 3.75의 근거는 HANNA에서 사람이 쓴 이야기의 평균 3.76점이다(5점 척도) [19]. 사람 작가 평균과 같은 높이를 출판 문턱으로 삼았다(설계 판단). 채점자와 글의 종류가 달라서 절대 비교는 아니고, 높이를 정하는 기준으로만 쓴다.
- **우수:** 출판 가능 조건에 더해 평균 4.25점 이상이고, Q3, Q4, Q9가 각 4점 이상이다. TTCW에서 AI 격차가 가장 컸던 쪽을 따로 요구한 것이다(설계 판단).
- **모델 비교 목표선:** 같은 하네스로 돌린 Haiku와 Luna의 점수를 목표선으로 본다. 로컬 모델은 이 점수와의 차이로 평가한다.
- **5화 전체:** 다음을 함께 낸다.
  - 회차별 판정
  - 5화 평균 점수
  - 회차 사이 설정 모순 누계. ConStory 방식으로 1만 자당 건수를 적는다. ConStory의 단위는 1만 단어이므로 한국어는 글자 수 기준으로 따로 적는다.

### 3.4 상향 지표: TTCW 통과율 (참고)

- 5화 전체를 한 작품으로 보고 TTCW 검사 14개에 통과와 불통과를 매긴다 [21].
- TTCW는 완결된 단편용 검사라서, 결말 검사는 5화까지의 흐름에 맞게 읽는다.
- 참고값은 뉴요커 84.7%, Claude v1.3 30.0%, GPT-4 27.9%, GPT-3.5 8.7%다.
- 문턱이나 목표로 쓰지 않는다. 모델 사이의 경향을 보는 지표로만 쓴다. LLM 채점이 이 검사에서 전문가와 맞지 않았기 때문이다(4절).

| 묶음 | 검사 (원문 질문) |
|---|---|
| 유창성 | 서사 속도 "Does the manipulation of time in terms of compression or stretching feel appropriate and balanced?" · 장면과 설명 "...balance between scene and summary/exposition?" · 언어와 문학적 장치 "...sophisticated use of idiom or metaphor or literary allusion?" · 결말 "...feel natural and earned, as opposed to arbitrary or abrupt?" · 이해와 일관성 "...work together to form a unified, engaging, and satisfying whole?" |
| 유연성 | 관점과 목소리 "...diverse perspectives, and if there are unlikeable characters, are their perspectives presented convincingly and accurately?" · 감정 "...balance between interiority and exteriority...?" · 구조 "...turns that are both surprising and appropriate?" |
| 독창성 | 주제와 내용 "...obtain a unique and original idea...?" · 생각 "...an original piece of writing without any cliches?" · 형식 "...originality in its form?" |
| 정교함 | 세계와 배경 "...believable at the sensory level?" · 인물 "...developed at the appropriate complexity level, ensuring that no character feels like they are present simply to satisfy a plot requirement?" · 수사적 복잡성 "...multiple 'levels' of meaning (surface and subtext)?" |

### 3.5 집계 범위 (2026-10-19 고정)

2026-10-18 검토서는 검토자마다 센 범위가 달랐다. 한 검토서는 문체 카드 규칙 위반을 T2에 넣었고, 다른 검토서는 따로 적었다. 다음부터는 아래 범위로 센다.

**T2에 센다.** 본문이 설정집이나 승인된 위키가 적은 사실과 어긋난 곳이다.

- 인물 사실(나이, 손잡이, 관계), 장소, 사물, 시간 순서
- 설정집이나 위키에 적힌 인물의 말투. 예를 들어 설정집은 반말인데 존댓말로 말한다. 표에는 `Characterization (voice)`로 적는다.
- ConStory 4분류로 적는다: Timeline & Plot Logic, Characterization, World-building & Setting, Factual & Detail Consistency

**T2에 세지 않는다.** 아래는 자리를 정해 다루고, 검토서에 따로 목록으로 적는다.

- 문체 카드의 글쓰기 규칙(`rules`) 위반. 문단은 세 문장 이하, 감정을 직접 말하지 않기, 금지 표현 같은 것이다. 가장 가까운 Q6~Q8 항목에 점수로 반영한다. 목록 이름은 "문체 카드 위반"이다. ConStory의 Narrative & Style 분류는 쓰지 않는다.
- 회차 안에서 스스로 어긋난 서술. 같은 사물의 위치가 바뀌는 것 같은 경우다. Q2에 반영한다. 목록 이름은 "내부 모순"이다.
- 지시문의 계획 순서 이탈, 근거가 약한 경계 사례. 목록 이름은 "세지 않은 항목"이고 이유를 한 줄씩 적는다.

회차 사이 설정 모순 누계(3.3절)와 1만 자당 건수도 이 범위로 센다.

### 3.6 작가가 반드시 고칠 곳

한 곳은 출판 전에 웹소설 작가라면 반드시 고쳐 쓸 한 문장 또는 한 문단이다. 한 곳에 문제가 여럿이어도 한 번만 센다. 검토자는 각 곳을 정확한 인용문과 한 줄 이유와 함께 "작가가 반드시 고칠 곳" 목록에 적고, 그 개수를 판정 데이터의 `mustFix`에 적는다.

**센다.**

- 설정집이나 승인된 위키와 어긋나는 곳, 잘못된 이름
- 깨지거나 문법에 맞지 않는 문장(맞춤법 검사기가 잡는 오타는 제외)
- 인물의 정해진 말투와 맞지 않는 대사
- 메타 텍스트나 외국어 문자
- 지시문 위반(`mustInclude` 누락은 T1에서 세므로 제외)
- 핵심 장면을 보여주지 않고 요약한 곳
- 앞선 장면이나 문장의 반복으로 새 정보가 없는 곳

**세지 않는다.** 문체 취향이나 검토자가 더 좋게 느낄 것 같은 부분이다.

## 4. 채점 방법과 한계

- **채점자는 Sonnet이다.**
  - 항목마다 본문 인용을 붙인다. 인용 없는 점수는 무효로 본다.
  - 채점자는 어떤 모델의 글인지 모른다. 여러 실행을 비교할 때는 순서를 섞는다.
- **LLM 채점의 한계 [20]:**
  - 작품 단위로는 사람 판단과 "약하거나 중간" 정도로만 맞는다. 모델 단위 순위는 "매우 높게" 맞는다.
  - 그래서 모델 비교에는 쓰지만, 회차 하나의 절대 점수는 참고로 본다.
  - 지침을 자세히 줘도 사람과의 일치가 확실히 오르지는 않았고, LLM은 점수의 근거를 대는 데 약했다. 인용을 강제하는 이유다.
- **TTCW에서 LLM 채점자는 전문가 판정과 평균적으로 양의 상관이 없었다 [21].** 그래서 상향 지표는 참고용으로만 쓴다.
- **자기 편향:** Sonnet이 같은 계열인 Haiku를 후하게 볼 위험이 있다. EQ-Bench도 자기 편향을 통제하지 못했다고 밝혔다 [22]. 비교 요약에 이 위험을 적는다.
- **두 번째 검토자:** 판정선 근처 실행은 첫 검토자와 따로 두 번째 검토자가 같은 입력을 독립으로 채점한다(`review-2.md`). 판정선 근처는 품질 점수 평균이 3.65 이상 3.85 이하이거나 걸린 문턱(T)이 1건뿐인 경우다. 두 검토서를 모두 적고, 판정이 다르면 비교 요약에 "판정 불일치"로 표시한다. 두 점수를 평균 내지 않는다. 같은 모델 계열의 두 번째 표본이라 자기 편향은 줄지 않는다.
- **반복 실행:** 규칙은 `docs/eval/novel/README.md` 6.3절에 있다.
- **사람 확인 (선택):** 비교 요약에 사용자가 몇 회차를 직접 읽고 점수와 비교해 볼 수 있는 칸을 둔다.

## 5. 출처와 확인 상태

확인 날짜는 모두 2026-10-18이다.

- ✔ Opus가 원문 페이지를 직접 열어 인용을 확인했다.
- ◐ Aside 조사에서 열람했다고 보고했고, 직접 재확인은 하지 않았다.
- ✖ 재게시본이나 검색 발췌만 있다. 원문을 확인하지 못했다.

조사 원문 보고서는 `docs/eval/research/2026-10-18-novel-quality/`에 있다. 파일은 a(해외 문학상), b(국내 문학상과 공모전), c(학술), d(웹소설 작법)다.

**문학상**
1. ◐ 알프레드 노벨 유언(1895), "the most outstanding work in an ideal direction". https://www.nobelprize.org/alfred_nobel/will/will-full.html
2. ◐ 스웨덴 한림원, 수상자 선정 방식. https://www.svenskaakademien.se/en/the-nobel-prize-in-literature/how-are-the-nobel-prize-laureates-in-literature-decided
3. ◐ 노벨위원회 위원 Ellen Mattson 인터뷰(2021), "It's literary merit. That's the only thing that counts." https://www.nobelprize.org/behind-the-scenes-of-the-nobel-prize-in-literature/
4. ◐ 노벨 문학상 선정 사유 2022~2026(에르노, 포세, 한강, 크러스너호르커이, 앤 카슨). https://www.nobelprize.org/prizes/literature/ 직접 열기는 403으로 막혔다.
5. ◐ 부커상 소개와 응모 규정. https://thebookerprizes.com/booker-prize · https://thebookerprizes.com/booker-prize/entering-the-booker-prizes
6. ✔ Women's Prize for Fiction, Terms and Conditions 2025, 1.4항: "'excellence' means excellence in quality of writing; 'originality' in perspective and craft; and 'accessibility' means titles that look outwards to a cross-section of readers." https://womensprize.com/app/uploads/2024/07/Terms_and_Conditions_WP_Fiction_2025.pdf
7. ✔ Women's Prize 심사 소개: "three core tenets ... excellence, originality and accessibility". https://womensprize.com/prizes/womens-prize-for-fiction
8. ◐ 퓰리처 2026 Plan of Award, "For distinguished fiction by an American author, preferably dealing with American life". https://www.pulitzer.org/page/2026-plan-award
9. ◐ 전미도서상, "Panels develop their own criteria". https://www.nationalbook.org/national-book-awards/how-works/
10. ◐ 휴고, 네뷸러, 에드거 규정(자격 요건만 있음). https://www.thehugoawards.org/hugo-categories/ · https://nebulas.sfwa.org/about-the-nebulas/nebula-rules/ · https://mysterywriters.org/edgars/edgar-award-category-information

**국내 공모전과 문학상**

11. ✔ 2021 네이버웹소설 지상최대 공모전(1 ROUND) 요강(링커리어 재게시본).
    - 심사 기준: 완성도 "연재 소설로서 적합한 스토리 전개 능력과 문장력을 갖췄는가", 성실성, 창의성 "서사 구성에 있어 작품만의 개성이 돋보이는가", 대중성 "서사에 몰입할 수 있는 재미, 흥미 요소가 충분한가", 모바일 친화도 "모바일 환경에서 감상하기에 적합한가"
    - 분량: "각 회차별 최소 글자수는 공백 포함 5,000자 이상입니다."
    - https://linkareer.com/activity/63236
12. ✖ 2026 대한민국 SF판타지 웹소설 공모전(대전광역시, 한국콘텐츠진흥원, 문피아). Aside는 대중성, 창의성, 완성도, 발전가능성을 보고했다.
    - 재게시본은 인증서 오류로 직접 열지 못했다.
    - 문구가 11번과 같아 섞였을 가능성이 있다.
    - https://www.contestindex.co.kr/index.php?category=16465&document_srl=60046&listStyle=viewer&mid=index&order_type=desc&page=1
13. ◐ 문피아 공모전 FAQ, "최소 25화 이상 연재" 또는 "글자수 10만 자 이상". https://nhelp.munpia.com/faq
14. ✔ 서울신문 2026 신춘문예 소설 심사평(2026-01-01).
    - "안정적인 구조와 문장"
    - "인물의 감정적 여정이 성급하게 마무리되었다는 느낌"
    - "소설의 주제가 서술과 대사로 직접 표현되는 후반부가 다소 교훈적으로 느껴져"
    - https://www.seoul.co.kr/news/life/contest2026/2026/01/01/20260101035002
15. ✔ 경향신문 2025 신춘문예 소설 심사평(2025-01-01).
    - "좋은 문학을 향한 요건의 최소 기준보다 최대 기준을 상상할 수 있기 때문"
    - "'다음 작품'에 대한 기대치를 합의의 기준점으로"
    - https://www.khan.co.kr/article/202501010600015
16. ✖ 한국일보 2025·2026 신춘문예 소설 심사평.
    - "사연 그 자체에만 집중하는 평면적 구조", "서사적 요소보다 직접적 진술로 진행", "'소설'로 전달되어야 하는지에 대한 설득력"
    - Aside가 인용했지만 링크를 확인하지 못했다. 확인한 두 링크는 당선작과 당선소감이었다.
17. ◐ 이상문학상 제49회 보도(한겨레, 2026-01-27). https://www.hani.co.kr/arti/culture/book/1241910.html
18. ✖ 2025 대한민국 판타지·SF 웹소설 공모전 심사평(전자신문, 2025-11-19), "글이 주는 오롯한 재미". 해당 기사 링크를 확인하지 못했다.

**학술**

19. ✔ Chhun, Colombo, Suchanek, Clavel (2022). Of Human Criteria and Automatic Metrics: A Benchmark of the Evaluation of Story Generation. COLING 2022.
    - 기준 6개: Relevance, Coherence, Empathy, Surprise, Engagement, Complexity. 5점 리커트 척도로, 이야기마다 평가자 3명이 매겼다.
    - 사람이 쓴 이야기 평균 3.76점, 최고 시스템 2.72~2.73점
    - https://arxiv.org/abs/2208.11646 · https://aclanthology.org/2022.coling-1.509/
20. ◐ Chhun, Suchanek, Clavel (2024). Do Language Models Enjoy Their Own Stories? TACL 12. https://aclanthology.org/2024.tacl-1.62/
21. ✔ Chakrabarty, Laban, Agarwal, Muresan, Wu (2024). Art or Artifice? Large Language Models and the False Promise of Creativity. CHI '24.
    - 검사 14개를 전문가 10명이 이야기 48편에 매겼다.
    - 평균 통과율: 뉴요커 84.7%, GPT-3.5 8.7%, GPT-4 27.9%, Claude v1.3 30.0%
    - https://arxiv.org/abs/2309.14556
22. ◐ EQ-Bench Creative Writing v3 (자체 공개 벤치마크, 동료 심사 없음). https://eqbench.com/creative_writing.html · https://eqbench.com/about.html
23. ◐ Wu 외 (2025). WritingBench. arXiv:2503.05244. https://arxiv.org/abs/2503.05244
24. ◐ Fein 외 (2026). LitBench. EACL 2026. https://aclanthology.org/2026.eacl-long.362/
25. ✔ Li, Guo, Wu, Lee, Li, Xie (2026). Lost in Stories: Consistency Bugs in Long Story Generation by LLMs. Findings of ACL 2026.
    - 모순 5분류: Timeline & Plot Logic, Characterization, World-building & Setting, Factual & Detail Consistency, Narrative & Style. 세부 유형은 19개다.
    - 지표: Consistency Error Density(1만 단어당 건수)
    - https://arxiv.org/abs/2603.05890
26. ◐ Green & Brock (2000). The role of transportation in the persuasiveness of public narratives. JPSP 79(5). https://doi.org/10.1037/0022-3514.79.5.701
27. ◐ Busselle & Bilandzic (2009). Measuring Narrative Engagement. Media Psychology 12(4). https://doi.org/10.1080/15213260903287259
28. ◐ Doshi & Hauser (2024). Generative AI enhances individual creativity but reduces the collective diversity of novel content. Science Advances 10. https://doi.org/10.1126/sciadv.adn5290

**웹소설 연구와 공공 자료**

29. ◐ 권용현 (2020). 연재형 콘텐츠의 성과 결정요인에 관한 연구. 정보사회와 미디어 21(1). https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002582760
30. ✔ 하철승 (2020). 웹소설 연재 주기와 연독률의 상관관계 연구. 인문사회과학연구 21(4).
    - "주 7회 이상의 연재가 많은 구독과 높은 연독률을 유지하는 데 긍정적인 영향"
    - "휴재 기간이 3일 이상 지속되면 독자의 대량 이탈"
    - https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002648591
31. ◐ 하철승 (2020). 웹소설 구독 행태 분석을 통한 성공적 연재 방안 제언. 인문사회 21 11(5), "가독성을 고려한 단문 형태의 문장으로 몰입감과 성취, 대리만족의 스토리텔링". https://www.kci.go.kr/kciportal/landing/article.kci?arti_id=ART002638741
32. ◐ 김나은 (2024). 현대 판타지 웹소설 흥행요인 분석. 글로벌문화콘텐츠 60. https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART003111221
33. ◐ 박수미 (2022). 웹소설 시스템이 서사구조에 미친 영향. 인문과학 87. https://m.riss.kr/search/detail/DetailView.do?control_no=12b23d959daafa7dd18150b21a227875&p_mat_type=1a0202e37d52c72d
34. ◐ 한국출판문화산업진흥원 (2025). 2024년 웹소설 산업 현황 실태조사, 16~17쪽. PDF가 커서 직접 열지 못했다. https://www.kpipa.or.kr/p/download/g3_1/143/0/
35. ◐ 한국출판문화산업진흥원 (2023). 2022년 웹소설 분야 산업 현황 실태조사. https://www.kpipa.or.kr/p/download/g3_1/117/0/
36. ◐ 국립국어원 (2022, 2024 수정). 한눈에 알아보는 공공언어 바로 쓰기(개정판), 11~13쪽(번역투 패턴). https://www.korean.go.kr/front/etcData/etcDataView.do?mn_id=&etc_seq=699&pageIndex=1
37. ✔ 국립국어원 온라인가나다 답변(2026-02-19), "피동 표현을 지나치게 많이 사용하는 경우 다소 부자연스러울 수는 있습니다만, 이는 어디까지나 문체적 문제". https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=27&pageIndex=1&qna_seq=327439

## 6. 근거를 찾지 못한 것

다음 항목은 공식 근거가 없다. 이 문서에서 관련 값은 (설계 판단)으로 두었고, 근거가 생기면 고친다.

- 웹소설 공모전의 항목별 배점. 열어 본 어느 공고에도 없었다.
- 회차 분량의 최신 공식 기준. 네이버 시리즈와 카카오페이지의 작가 가이드는 열지 못했다. 블로그 수치는 3,500~10,000자로 엇갈려서 쓰지 않았다.
- 문단 길이, 대사 비율, 절단신공, 초반 3화 이탈률의 수치
- 동인문학상 심사평, 이상문학상 공식 심사 기준, 카카오와 네이버 공모전의 최신 공식 원문
