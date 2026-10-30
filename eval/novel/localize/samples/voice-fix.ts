import { voiceFixTask, type VoiceFixInput } from '@/ai/tasks/voice-fix'

// The voice-fix prompt for one English scene: two voices and two marked lines.
export const voiceFixInput: VoiceFixInput = {
  marked: 'Mina said. ⟦1⟧"I brought the laundry."\nJun asked. ⟦2⟧"Who is there."',
  voices: [
    { name: 'Mina', level: 'banmal', speech: 'Short and blunt.' },
    { name: 'Jun', level: 'jondaet', speech: 'Polite and calm.' },
  ],
}

export const voiceFixSample = voiceFixTask.buildPrompt(voiceFixInput)
