import '@testing-library/jest-dom/vitest'

// Tests pin the feature off unless a test turns it on; voice.test.ts checks the default with an explicit env object.
if (process.env.AI_SPEECH_STYLE === undefined) process.env.AI_SPEECH_STYLE = 'off'
