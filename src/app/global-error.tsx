'use client'

import { useEffect } from 'react'

// Replaces the root layout when it or (app)/layout.tsx fails. Global CSS is not loaded here,
// so the styles are inline and use system colors to follow the OS color scheme.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="ko">
      <head>
        <title>다음화 - 오류</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 16,
          colorScheme: 'light dark',
          background: 'Canvas',
          color: 'CanvasText',
          fontFamily:
            '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>문제가 발생했습니다</h1>
        <p style={{ margin: 0, opacity: 0.7 }}>잠시 후 다시 시도해 주세요.</p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            marginTop: 8,
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid currentColor',
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            cursor: 'pointer',
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  )
}
