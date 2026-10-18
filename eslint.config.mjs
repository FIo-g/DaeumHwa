import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Test-only fakes must not reach the app bundle.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/test/*'], message: '테스트 전용 코드입니다.' },
            // Relative imports that reach the test helpers, e.g. '../test/factories'.
            {
              group: [
                '**/test/fake-ai',
                '**/test/ai-fakes/**',
                '**/test/factories',
                '**/test/db',
                '**/test/setup',
              ],
              message: '테스트 전용 코드입니다.',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Local data and tool output:
    '.data/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'eval/results/**',
  ]),
])

export default eslintConfig
