---
name: 다음화
description: An editorial workspace for serial fiction authors who check manuscripts against a story wiki
colors:
  ink: '#171814'
  paper: '#fffcf3'
  kraft: '#e2d3b3'
  sand: '#ece3cd'
  cream: '#f5efe0'
  muted-ink: '#44473a'
  proof-red: '#991b2c'
  wiki-blue: '#164580'
typography:
  display:
    fontFamily: 'Black Han Sans, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif'
    fontSize: 'clamp(2.5rem, 8.333333vw, 7.5rem)'
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: '-0.045em'
  title:
    fontFamily: 'Black Han Sans, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif'
    fontSize: 'clamp(2.25rem, 5.56vw, 5rem)'
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: '-0.04em'
  work-title:
    fontFamily: 'Black Han Sans, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif'
    fontSize: 'clamp(2rem, 3.9vw, 3.5rem)'
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: '-0.04em'
  heading:
    fontFamily: 'Black Han Sans, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif'
    fontSize: 'clamp(1.75rem, 3.34vw, 3rem)'
    fontWeight: 400
    lineHeight: 1.14
    letterSpacing: '-0.03em'
  subhead:
    fontFamily: 'IBM Plex Sans KR, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif'
    fontSize: 'clamp(1.25rem, 2vw, 1.75rem)'
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: '-0.02em'
  lede:
    fontFamily: 'IBM Plex Sans KR, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: '-0.012em'
  manuscript:
    fontFamily: 'IBM Plex Sans KR, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 400
    lineHeight: 1.95
    letterSpacing: '0'
  canon-quote:
    fontFamily: 'IBM Plex Sans KR, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif'
    fontSize: '1.0625rem'
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: '0'
  body:
    fontFamily: 'IBM Plex Sans KR, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: '-0.01em'
  label:
    fontFamily: 'IBM Plex Sans KR, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: '0'
  hand:
    fontFamily: 'Nanum Pen Script, IBM Plex Sans KR, Apple SD Gothic Neo, cursive'
    fontSize: 'clamp(1.625rem, 2.5vw, 2.125rem)'
    fontWeight: 400
    lineHeight: 1.06
    letterSpacing: '0'
rounded:
  field: '8px'
  button: '10px'
  card: '16px'
  sheet: '24px'
spacing:
  xxs: '4px'
  xs: '8px'
  sm: '12px'
  md: '16px'
  lg: '24px'
  xl: '32px'
  2xl: '48px'
  3xl: '64px'
  4xl: '96px'
  edge: 'clamp(16px, 5.56vw, 80px)'
  band: 'clamp(48px, 7vw, 96px)'
  app: 'clamp(24px, 3.34vw, 48px)'
components:
  button-primary:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.paper}'
    typography: '{typography.label}'
    rounded: '{rounded.button}'
    height: '44px'
    padding: '0 16px'
  button-start:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.paper}'
    rounded: '{rounded.button}'
    height: '52px'
    padding: '0 24px'
  button-outline:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.button}'
    height: '44px'
    padding: '0 16px'
  button-outline-hover:
    backgroundColor: '{colors.sand}'
  button-ghost-hover:
    backgroundColor: '{colors.sand}'
    textColor: '{colors.ink}'
  input:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.field}'
    height: '44px'
    padding: '8px 12px'
  finding-card:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '16px'
  fact-badge-confirmed:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.field}'
    height: '20px'
    padding: '2px 8px'
  nav-item:
    textColor: '{colors.muted-ink}'
    typography: '{typography.label}'
    rounded: '{rounded.button}'
    height: '44px'
    padding: '0 12px'
  nav-item-active:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.paper}'
---

# Design System for 다음화

## Overview

Use wide color bands and large ink headings to frame three parts of an editorial task. Start with a manuscript, show a source in the story wiki, and let the author decide which one to change. Use the same motion timings in the public pages and the workspace. Keep the paper under a manuscript, quote, or field upright and opaque.

## Colors

- Ink covers titles, buttons, outlines, focus rings, and ledger symbols. Use paper text and focus rings on an ink band.
- Paper covers the navigation, manuscript, fields, quotes, and overlays. Muted ink covers secondary text, placeholders, and field outlines.
- Use one paper palette. Reserve kraft for one or two major surfaces per screen. Separate other surfaces with sand, cream, paper, and two-pixel ink outlines.
- Multiply a fine SVG grain over the page at 40% opacity. Let it cover dialogs, sheets, tooltips, and toasts. Keep the texture clear of pointer events. Hide it in print.
- Proof red and wiki blue are the only chromatic accents. Use red for manuscript proof marks and blue for direct wiki quotations. Pair each mark and quote with an ink label.
- Use ink or muted ink for validation, destructive actions, links, and fact states. Set confirmed, assumed, and undecided fact badges in solid, dashed, and dotted outlines.

## Typography

Use Black Han Sans 400 for the wordmark, display, title, and heading. Use IBM Plex Sans KR 400–700 for the UI, manuscript, and quotations. Use 400 for reading and input. Use 700 for buttons, tabs, and subheads. Limit Nanum Pen Script 400 to one or two short lines.

Display text reaches 120px at 1440px. Full page titles reach 80px and headings reach 48px. Balance heading and card title lines. Use pretty wrapping for body copy. Preserve Korean word boundaries and let long unbroken titles wrap when needed. Limit manuscripts to 48rem and introduction paragraphs to 36rem. Match font face, line height, padding, and wrapping between an editor and its proof overlay.

## Layout

Limit the inner width to 1280px. Use 16–80px side gutters and 48–96px vertical padding on full-width bands. Use 24–48px on work pages and 16–32px inside cards. Use a twelve-column grid with 24px gaps at 1024px and above. Checks use seven columns for the manuscript and five for evidence. The wiki reverses those proportions. Stack those layouts at narrower widths. Let a 46rem ledger scroll inside its own wrapper.

Inside the work layout, use a 32–56px title and 14–22px vertical padding in the header band. Keep paper decorations small. At 1440 × 900, target a header height of 170px or less. Allow up to 230px for the settings board header with tabs. Use full-size titles on the landing, login, signup, and My Works pages.

Use a sticky 64px paper bar from 640px and a 56px bar below 640px. Move work navigation into a bottom sheet below 768px. In the existing manuscript workspace, keep the side panel at 320px from 1024px and at 380px from 1280px.

## Elevation & Depth

Reserve the 4px by 5px offset ink shadow for prominent calls to action and stacked cards. Reveal the larger 7px by 8px shadow with an opacity transition. Start the stacked cards at −5°, 2°, and 5°. On hover or focus, lift the face by 8px and set its angle to zero. Overlap by 24px at 1024px and above and by 12px from 640px to 1023px. Below 640px use a 12px gap.

## Shapes

Use 8px field corners, 10px button corners, 16px card corners, and 24px sheet corners. Apply two-pixel ink outlines to buttons and cards, one-pixel list dividers, and two-pixel proof lines. Give standard controls a 44px target. Reserve 36px targets for dense toolbars. Set focus outlines 3px outside the control.

## Components

- **Buttons.** Use ink and paper for primary actions. Use a paper fill and ink outline for secondary actions. A prominent call to action splits the label and arrow into two moving surfaces. Give the arrow a kraft fill on a primary action.
- **Navigation.** Mark the active work link with an ink fill, bold paper text, and an underline. Use an ink count badge for pending approvals. Let the line-tab indicator follow the selected tab.
- **Fields.** Use paper, a muted-ink border, and an ink caret. Use a stronger ink outline and a written error for invalid input.
- **Findings.** Place the marked manuscript phrase next to the direct wiki quote. Keep the source link and action labels in ink. Draw proof circles, underlines, and strike-throughs over short phrases. Replay each stroke through its own SVG.
- **Ledger.** Use an ink circle for the planted chapter, an open ink diamond for the target, and a dotted line for the plan. Add text names for the symbols.
- **Overlays.** Use paper sheets and an ink backdrop. Start focus on the close button and return it to the opener. Toasts enter from the bottom with a two-pixel ink outline.

## Motion

| Token         | Value  | Application                                              |
| ------------- | ------ | -------------------------------------------------------- |
| `--b-quick`   | 160ms  | Presses, icons, color changes, and closing answers       |
| `--b-step`    | 260ms  | Rows, chips, pointer responses, and short page arrivals  |
| `--b-draw`    | 420ms  | CTA return, proof strokes, and sheet travel              |
| `--b-scene`   | 640ms  | Scroll reveals and handwriting                           |
| `--b-arrival` | 900ms  | First assembly and paired decorations                    |
| `--b-cycle`   | 2400ms | Decorative demonstrations, up to two cycles per entrance |
| `--b-stagger` | 70ms   | Sibling entrances, up to six delay positions             |

Use `--b-out` for arrivals, `--b-pop` for a brief overshoot, `--b-in-out` for two-way travel, and `--b-linear` for scroll progress. The default reveal range is `entry 0% cover 30%`. Preserve full opacity for reveal text. A decoration can start at 35% opacity and 32px from its destination. Keep the first headline and action available immediately. Show final states when the user requests reduced motion.

## Do's and Don'ts

### Do

- Show the actual manuscript and its source when explaining an inconsistency.
- Compose Base UI components through the `render` prop.
- Put scroll-linked motion and local motion on separate elements. Change only the decoration key when replaying a scene.
- Use native scrolling and keyboard controls. Check 1440px, 390px, 320px, and reduced motion.
- Use short Korean interface labels and concise polite sentences.

### Don't

- Avoid left-edge markers for selected navigation. Use a chip or underline.
- Keep manuscripts and input wrappers clear of transforms, parallax, and blur.
- Reserve red for manuscript proof marks and blue for direct wiki quotations.
- Avoid feature-card grids, background particles, glowing gradients, and borrowed reference imagery.
