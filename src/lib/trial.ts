export const TRIAL_SIGNUP_MESSAGE = '가입 후 이용할 수 있습니다.'

export function isTrialCheckChapter(position: number): boolean {
  return position === 2 || position === 3
}
