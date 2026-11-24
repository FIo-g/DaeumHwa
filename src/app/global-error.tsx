'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="ko">
      <head>
        <title>다음화 · 오류</title>
        <style>{`
          body {
            display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 16px;
            box-sizing: border-box; background: #f1bb88; color: #171814; color-scheme: light;
            font: 400 1rem/1.6 "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
          }
          section { background: #fffcf3; border: 2px solid; border-radius: 16px; padding: 32px; }
          h1 { margin: 0; font-size: clamp(1.75rem, 3.34vw, 3rem); line-height: 1.14; }
          button {
            min-height: 44px; padding: 8px 16px; border: 2px solid #171814; border-radius: 10px;
            color: #fffcf3; background: #171814; font: inherit; font-weight: 700; cursor: pointer;
          }
          button:hover { background: #44473a; }
          button:focus-visible { outline: 2px solid #171814; outline-offset: 3px; }
        `}</style>
      </head>
      <body>
        <section>
          <h1>페이지를 불러오지 못했어요</h1>
          <p>잠시 후 다시 시도해 주세요.</p>
          <button type="button" onClick={retry}>
            다시 시도
          </button>
        </section>
      </body>
    </html>
  )
}
