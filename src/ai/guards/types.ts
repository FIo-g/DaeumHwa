// Shared shapes for the guard library. Types only; no runtime code.

export type Lang = 'ko' | 'en'

export type ForeignScript = 'han' | 'kana' | 'cyrillic' | 'replacement' | 'latin' | 'hangul'

/** A run of wrong-language or broken script. Offsets are UTF-16 indices into the input text. */
export type ForeignSpan = { start: number; end: number; text: string; script: ForeignScript }

export type RepeatedWord = { word: string; count: number; per1000: number; positions: number[] }

export type SampleCopyHit = { start: number; end: number; text: string; example: string; score: number }
