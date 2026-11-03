import { josa } from 'es-hangul'

// The rendered context pack labels items with refs ([F1], [E2], [T1]) and fact statuses
// ([확정], [가정], [미정]). The model sometimes copies those labels into the evidence and the
// explanation. The wiki's own text never has them, so they are dropped before storing.

const BRACKET_TOKEN_RE = /\[(?:[FET]\d+|확정|가정|미정)\]\s*/g
const PAREN_REF_RE = /\s*\((?:[FET]\d+(?:\s*,\s*[FET]\d+)*)\)/g

type JosaOption =
  | '이/가'
  | '을/를'
  | '은/는'
  | '으로/로'
  | '와/과'
  | '이나/나'
  | '이란/란'
  | '아/야'
  | '이랑/랑'
  | '이에요/예요'
  | '으로서/로서'
  | '으로써/로써'
  | '으로부터/로부터'
  | '이라/라'

type ParticleRule = { form: string; option: JosaOption }

// When a ref sat between a noun and a particle ("설정 F12와"), dropping the ref leaves the wrong
// particle form. The form in the text tells which pair to pick from for the noun.
const PARTICLE_RULES: ParticleRule[] = [
  { form: '으로부터', option: '으로부터/로부터' },
  { form: '으로서', option: '으로서/로서' },
  { form: '으로써', option: '으로써/로써' },
  { form: '로부터', option: '으로부터/로부터' },
  { form: '로서', option: '으로서/로서' },
  { form: '로써', option: '으로써/로써' },
  { form: '이에요', option: '이에요/예요' },
  { form: '이란', option: '이란/란' },
  { form: '이나', option: '이나/나' },
  { form: '이랑', option: '이랑/랑' },
  { form: '이라', option: '이라/라' },
  { form: '으로', option: '으로/로' },
  { form: '은', option: '은/는' },
  { form: '는', option: '은/는' },
  { form: '이', option: '이/가' },
  { form: '가', option: '이/가' },
  { form: '을', option: '을/를' },
  { form: '를', option: '을/를' },
  { form: '와', option: '와/과' },
  { form: '과', option: '와/과' },
  { form: '로', option: '으로/로' },
  { form: '야', option: '아/야' },
  { form: '아', option: '아/야' },
]

const PAIRED_FORMS = PARTICLE_RULES.map((rule) => rule.form).sort((a, b) => b.length - a.length)
const OPTION_OF_FORM = new Map(PARTICLE_RULES.map((rule) => [rule.form, rule.option]))

// A particle counts only when it ends the word before whitespace, punctuation or the end, so the
// 이 in "위키 F1이다" stays as the copula instead of turning into the subject particle.
const PARTICLE_END = String.raw`(?=[\s.,!?;:)\]}'"…]|$)`
const WORD_REF_RE = new RegExp(
  `(위키|설정|사실|카드) [FET]\\d+((?:${PAIRED_FORMS.join('|')})${PARTICLE_END})?`,
  'g',
)

/** Drops pack refs and status tags from model text and repairs the particle left behind a ref. */
export function stripPackRefs(text: string): string {
  return text
    .replace(BRACKET_TOKEN_RE, '')
    .replace(PAREN_REF_RE, '')
    .replace(WORD_REF_RE, (_match, word: string, particle: string | undefined) => {
      const option = particle === undefined ? undefined : OPTION_OF_FORM.get(particle)
      return option === undefined ? word : word + josa.pick(word, option)
    })
    .trim()
}
