import { renderContextPack } from '@/ai/context'
import { buildDraftPrefix, buildDraftPrompt } from '@/ai/tasks/draft-chapter'
import { pack } from './shared'

export const draftSample = buildDraftPrompt({
  instructions: 'Mina finds the letter under the stairs.',
  targetChars: 3000,
  styleCards: [
    {
      name: 'Mina Park speech',
      entryName: 'Mina Park',
      tone: 'blunt',
      rules: 'Short sentences.',
      examples: 'Fine. Move.',
    },
    { name: 'Narration', entryName: null, tone: '', rules: '', examples: '' },
  ],
  packText: renderContextPack(pack),
  previousSummary: null,
  previousTail: 'The door closed.',
  chapterLabel: '4화 (새 회차)',
})

// The cached prefix of the English draft prompt (stage 2): requests of every kind, a core entry and
// the previous text. Every new Korean line of the prefix must be translated.
export const draftPrefixSample = buildDraftPrefix({
  instructions: 'Mina finds the letter under the stairs.',
  targetChars: 3000,
  styleCards: [{ name: 'Narration', entryName: null, tone: '', rules: '', examples: '' }],
  packText: renderContextPack(pack),
  previousSummary: null,
  previousTail: 'The door closed.',
  chapterLabel: '4화 (새 회차)',
  requests: [
    {
      id: 'w1',
      scope: 'work',
      kind: 'style',
      text: 'Keep sentences short.',
      pattern: null,
      speechLevel: null,
      targetChars: null,
      chapterPosition: null,
      entryId: null,
      entryName: null,
    },
    {
      id: 'c1',
      scope: 'character',
      kind: 'speech',
      text: 'Mina speaks casually.',
      pattern: null,
      speechLevel: 'banmal',
      targetChars: null,
      chapterPosition: null,
      entryId: 'e1',
      entryName: 'Mina Park',
    },
    {
      id: 'b1',
      scope: 'work',
      kind: 'ban',
      text: 'Do not write "nod".',
      pattern: 'nod',
      speechLevel: null,
      targetChars: null,
      chapterPosition: null,
      entryId: null,
      entryName: null,
    },
    {
      id: 'l1',
      scope: 'chapter',
      kind: 'length',
      text: 'This chapter is long.',
      pattern: null,
      speechLevel: null,
      targetChars: 3000,
      chapterPosition: 4,
      entryId: null,
      entryName: null,
    },
  ],
  coreText: '[E1] Mina Park (character)\n- Summary: A bell keeper.',
})
