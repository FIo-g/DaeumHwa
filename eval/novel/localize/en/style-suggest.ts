import { EN_TAG_DATA_RULE } from './shared'

export const STYLE_SUGGEST_SYSTEM = `You analyze a web novel character's dialogue and turn it into a style card.
Rules:
- Base the analysis only on the dialogue in <samples>. Do not make anything up.
- name is written in the form "character name speech style".
- tone is one sentence giving the overall impression of the character's speech.
- rules lists the speech rules, one per line (sentence endings, formal and casual speech, frequently used expressions, sentence length, expressions never used).
- examples copies 3 to 5 lines of sample dialogue that are most characteristic of the character, exactly as they are written.
${EN_TAG_DATA_RULE}
- Write all output in English.`
