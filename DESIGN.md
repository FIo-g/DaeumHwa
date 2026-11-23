---
name: 다음화
description: 웹소설 작가의 원고를 설정 위키와 맞춰 보고, 교정지처럼 표시해 돌려주는 연재 파트너
colors:
  desk: "#eef0ed"
  sheet: "#fafbf9"
  graphite: "#2b2d2c"
  graphite-muted: "#565b58"
  pencil-grey: "#8f9591"
  margin-rule: "#c9cdc8"
  hairline: "#d3d7d2"
  wash: "#e2e5e1"
  wash-muted: "#e4e7e3"
  proof-red: "#c8321f"
  blue-pencil: "#2f5d9e"
typography:
  display:
    fontFamily: "Noto Serif KR, AppleMyungjo, Nanum Myeongjo, serif"
    fontSize: "3.75rem"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Noto Serif KR, AppleMyungjo, Nanum Myeongjo, serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Noto Serif KR, AppleMyungjo, Nanum Myeongjo, serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  manuscript:
    fontFamily: "Noto Serif KR, AppleMyungjo, Nanum Myeongjo, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 2.1
  canon-quote:
    fontFamily: "Noto Serif KR, AppleMyungjo, Nanum Myeongjo, serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "28px"
  lede:
    fontFamily: "Apple SD Gothic Neo, Malgun Gothic, Noto Sans KR, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "Apple SD Gothic Neo, Malgun Gothic, Noto Sans KR, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Apple SD Gothic Neo, Malgun Gothic, Noto Sans KR, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
rounded:
  sm: "2.4px"
  md: "4px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  sheet: "80px"
components:
  button-primary:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.sheet}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 10px"
  button-start:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 24px"
  button-outline:
    backgroundColor: "{colors.desk}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 10px"
  button-outline-hover:
    backgroundColor: "{colors.wash-muted}"
  button-ghost-hover:
    backgroundColor: "{colors.wash-muted}"
    textColor: "{colors.graphite}"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "4px 10px"
  finding-card:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.sm}"
    padding: "16px"
  fact-badge-confirmed:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.blue-pencil}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "20px"
    padding: "2px 8px"
  nav-item:
    textColor: "{colors.graphite-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  nav-item-active:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.graphite}"
---

# Design System: 다음화

## Overview

**Creative North Star: "The Returned Galley Proof" (교정지)**

Every screen is an editor's proof handed back to the author: cool proof paper on a slightly darker desk, graphite type, one hairline margin rule, and two pencils. A proof-red pencil marks what is wrong in the manuscript; a blue pencil quotes the canon, the settled fact from the wiki. The intro page plays this out at full size, with a circled word and a red leader running into the margin. Inside the app the same world shows as precision and restraint: sheet-coloured working areas, serif for anything that is manuscript or canon, a quiet system sans for controls.

Density is that of a working document, not a dashboard. Surfaces are flat paper separated by 1px rules; the only lift in the system is the sheet itself sitting on the desk. Light scene only: there is no theme switch, and the inherited shadcn dark block in `globals.css` is not part of this system.

The world refuses the category default for this product: a SaaS hero beside a framed app screenshot, then a row of feature cards.

**Key Characteristics:**
- Cool proof paper (sheet on desk), graphite text, a single 1px margin rule.
- Two pencils with fixed jobs: proof red for errors, blue pencil for the canon.
- Myeongjo serif for headlines, manuscript and canon quotes; system Hangul sans for UI.
- Marks are drawn strokes (circle, underline, leader), drawn once.
- Corners of 2 to 4px; flat surfaces; one soft sheet lift.

## Colors

A near-neutral cool paper palette carrying exactly two inks, each with a single job.

### Primary
- **Graphite** (`graphite`): all text, primary buttons, the active tab underline, the pending count chip. It is the ink of the page; buttons in graphite read as type, not as brand colour.

### Secondary
- **Proof Red** (`proof-red`): marks on the manuscript (circle, underline, leader), the correction word, the finding kind label, the suggested sentence, destructive actions and error text. Nothing decorative.

### Tertiary
- **Blue Pencil** (`blue-pencil`): the canon. Quoted wiki originals, links to wiki cards, confirmed and assumed fact markers, planted points on the thread ledger, focus rings, caret, selection tint (22%) and native `accent-color`.

### Neutral
- **Desk** (`desk`): page background behind the sheet, the app sidebar column, outline button fill.
- **Sheet** (`sheet`): the proof paper. Cards, popovers, the top bar, the working area of a work, the auth card, the landing sheet.
- **Graphite Muted** (`graphite-muted`): secondary text, captions, field labels, inactive nav.
- **Pencil Grey** (`pencil-grey`): input strokes, undecided (dotted) markers, unplanted thread lines, scrollbar thumb.
- **Margin Rule** (`margin-rule`): the 1px rule. Section dividers, the margin column's left rule, card borders, top-bar and tab baselines.
- **Hairline** (`hairline`): the default component border from the shadcn layer.
- **Wash / Wash Muted** (`wash`, `wash-muted`): secondary button fill and hover fill for outline and ghost controls.

### Named Rules
**The Two Pencils Rule.** Proof red only marks what is wrong; blue pencil only carries the canon and focus. Never swap them, never use either as a solid fill (translucent text highlights only: 5% red hover, 12% blue comment highlight, 22% blue selection), and never introduce a third accent.

**The Shape Carries Status Rule.** Fact status reads without colour: confirmed is a solid blue line, assumed is dashed blue, undecided is dotted grey.

## Typography

**Display Font:** Noto Serif KR via `next/font` (with AppleMyungjo, Nanum Myeongjo, serif)
**Body Font:** system Hangul sans (Apple SD Gothic Neo, Malgun Gothic, Noto Sans KR, system-ui)

**Character:** A typeset Myeongjo for everything that is the story or the canon, against an unbranded system sans for everything that is a control. The split tells the author at a glance which text is theirs.

### Hierarchy
- **Display** (700, 2.5rem mobile to 3.75rem desktop, 1.18): the intro page headline only, balanced, two lines.
- **Headline** (600, 1.875rem to 2.25rem, 1.25): intro page section heads.
- **Title** (600, 1.75rem, 1.25): app page titles (page header), auth wordmark at 1.875rem/700.
- **Manuscript** (400, 17px, 2.1): the editor and its highlight layer, which must share exactly this font, padding and leading. Landing excerpts use the same 2.1 leading at 20 to 24px.
- **Canon quote** (400, 15px, 28px): quoted manuscript and wiki lines inside findings; the margin note uses 18px relaxed.
- **Lede** (sans 400, 1.125 to 1.25rem, 1.625, max 34rem): intro paragraphs.
- **Body** (sans 400, 0.875rem): UI text, nav, descriptions.
- **Label** (sans 500, 0.75rem): badges, finding kind, field captions such as 원고 / 위키 원문.

### Named Rules
**The Whose Text Rule.** Serif means manuscript, canon or a heading; sans means interface. A control is never set in serif, and a quoted sentence is never set in sans.

**The Keep-Words Rule.** Korean headings and prose use `break-keep` so words do not split mid-syllable-block.

## Layout

The intro page is one centred sheet (max 1320px) on the desk with a 24px desk margin from `sm` up. Inside, a two-column proof row from `lg`: a text block (max 44 to 46rem) and a margin column of 21rem (24rem at `xl`) behind a 1px rule with 40px inner padding. Sheet gutters are 24px, 48px at `sm`, 80px at `lg`; sections are separated by a full-width rule and 64 to 96px of vertical space. Below `lg` the margin note stacks under its sentence with a top rule, and leaders are hidden.

The app is a top bar (56px, sheet, bottom rule), then on a work a 224px sidebar on the desk and a sheet working area with a left rule (16px padding mobile, 40px desktop). The writing screen splits manuscript and side panel; findings switch to two columns (manuscript | canon) inside their card via a container query. Auth pages are a single 384px sheet card.

Spacing steps observed: 8, 12, 16, 24, 40 and 80px.

## Elevation & Depth

Flat by default. Depth comes from tone (sheet on desk) and 1px rules, not shadows. There is one shadow in the system, for the sheet itself.

### Shadow Vocabulary
- **Sheet lift** (`box-shadow: 0 1px 2px rgb(43 45 44 / 0.06), 0 18px 40px -24px rgb(43 45 44 / 0.35)`): the landing sheet and the auth card, where a whole page of paper sits on the desk. Not on cards, panels or buttons.

### Named Rules
**The One Sheet Rule.** Only a full sheet of paper lifts. Cards inside the sheet are bordered with the margin rule, never shadowed.

## Shapes

Nearly square paper. The base radius is 4px (buttons, inputs, tabs' list); cards, badges, nav items and findings use the small step (about 2.4px). Full circles appear only as ledger dots and the hand-drawn proof circle. Borders are always 1px, in margin rule or hairline; the 2px weight is reserved for marks (underlines, ledger lines, active tab).

## Components

### Buttons
Type-like and plain.
- **Shape:** 4px corners, 32px tall (28px small), sans 14px medium.
- **Primary:** graphite fill, sheet text. The intro page start button is the same at 48px tall, 24px side padding, 16px semibold.
- **Hover / Focus:** primary fades to 80% graphite; focus shows a 3px blue-pencil ring at 50%; press nudges down 1px.
- **Outline / Ghost / Secondary:** outline sits on desk with a hairline border; ghost is bare; both hover to wash. Secondary is a wash fill.
- **Text links as actions:** underlined with the margin rule colour, darkening to the current colour on hover (로그인, card links).

### Chips (filters, statuses)
- **Filters:** URL-driven links styled as small buttons; active is primary, inactive is outline.
- **Fact status:** outline badge on sheet, 20px, small radius. Confirmed solid blue, assumed dashed blue with `[가정]`, undecided dotted grey.

### Cards / Containers
- **Corner Style:** small radius (about 2.4px).
- **Background:** sheet.
- **Shadow Strategy:** none (see The One Sheet Rule).
- **Border:** 1px margin rule.
- **Internal Padding:** 16px (12px compact).

### Inputs / Fields
- **Style:** 1px pencil-grey stroke, transparent on sheet, 4px corners, 32px tall; caret in blue pencil.
- **Focus:** border turns blue pencil with a 3px ring at 50%.
- **Error / Disabled:** border in proof red with a 20% red ring; disabled at 50% opacity.

### Navigation
- **Top bar:** sheet, bottom rule, serif wordmark left, user name and ghost 로그아웃 right.
- **Work sidebar:** on desk, the work title in serif, a 홈 item, then plain-text group labels (원고, 설정, 연재, 작품). Items are 14px sans muted; active sits on sheet with an inset 1px margin-rule outline and medium weight. The approvals count is a graphite chip with tabular numerals. Mobile collapses to a title row with a menu.
- **Tabs:** a line under the row in margin rule; the active tab is semibold graphite with a 2px graphite underline.

### Proof Mark (signature)
The finding mark, drawn once.
- **Intro page:** a hand-drawn proof-red ellipse (1.75px, round caps, non-scaling) around the wrong words, plus on `lg` a 1.5px red leader from the circle to the margin note, which aligns to the marked line. The first-screen mark draws itself (0.45s stroke, then the leader reaches in 0.25s after 0.6s); later marks are static.
- **In the app:** a 2px proof-red underline under the issue in the manuscript, drawn left to right once in 0.45s when the finding lands, thickening to 3px when the finding is active. This is the user's settled choice; the app does not use the circle.
- **Motion:** one pencil-stroke draw, `cubic-bezier(0.16, 1, 0.3, 1)`, under 900ms in total. Reduced motion shows the mark already drawn.

### Finding Card
Sheet card with a kind label in proof red and severity in muted text, then 원고 (the sentence underlined in red, clickable to jump) beside 위키 원문 (the fact in blue serif, with a link to its card), split by a rule. The suggestion follows in red serif, then actions: 제안대로 고치기 (primary), 위키 고치기 (secondary), 무시 (ghost).

### Margin Note
On the intro page: the correction in red serif 24px semibold, the wiki original in blue serif 18px, and a muted caption naming the source card.

## Do's and Don'ts

### Do:
- **Do** keep proof red for marks and errors and blue pencil for the canon and focus, nothing else.
- **Do** draw marks as strokes: circle and leader on the intro page, a 2px underline in the app, wavy red for spelling, dotted blue for naming.
- **Do** set manuscript and canon text in Noto Serif KR and controls in the system sans.
- **Do** separate surfaces with the 1px margin rule (`#c9cdc8`) and keep corners at 2 to 4px.
- **Do** quote both texts in full when showing a finding: the manuscript sentence and the wiki original.
- **Do** write every UI string in short, plain Korean; compose shadcn (Base UI) parts with the `render` prop.
- **Do** honour reduced motion by showing marks already drawn.

### Don't:
- **Don't** mark findings with tinted left borders, coloured backgrounds or pill badges.
- **Don't** shadow cards, panels or buttons; only a whole sheet lifts.
- **Don't** add a third accent colour or use either pencil as a large fill.
- **Don't** build a SaaS hero with a framed app screenshot followed by a row of feature cards.
- **Don't** add a dark theme or theme switch; the system is light only.
- **Don't** author motion beyond the pencil-stroke draw (plain hover and colour transitions aside), and never loop it.
