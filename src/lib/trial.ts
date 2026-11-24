export const TRIAL_SIGNUP_MESSAGE = '가입하고 모든 기능을 이용해 보세요.'

export function isTrialCheckChapter(position: number): boolean {
  return position === 2 || position === 3
}
