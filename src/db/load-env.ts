import path from 'node:path'

/**
 * Loads local env files for CLI scripts that run outside `next dev` and `next start`
 * (for example `pnpm db:migrate`), so they see the same DATABASE_URL and PGLITE_DATA_DIR.
 * Variables already set in the shell win over file values.
 */
export function loadLocalEnv(dir: string = process.cwd()): void {
  // process.loadEnvFile never overrides a variable that is already set,
  // so load the higher-priority file first (.env.local before .env).
  for (const name of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(path.join(dir, name))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}
