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
          :root { --paper: #fbfaf5; --ink: #1c1b19; --grid: #3f8f6b; }
          body {
            display: grid; place-items: center; min-height: 100vh; margin: 0;
            padding: clamp(2.25rem, 4.85vw, 4.5rem) 1rem;
            box-sizing: border-box; background: var(--paper); color: var(--ink); color-scheme: light;
            font: 400 1rem/1.6 "IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
            word-break: keep-all;
          }
          section {
            inline-size: min(100%, 40rem); padding-block-start: 1rem;
            border-block-start: 2px solid var(--grid);
          }
          h1 {
            margin: 0; font: 900 clamp(1.625rem, 2.6vw, 2.5rem)/1.23
              "Noto Serif KR", "AppleMyungjo", Batang, serif;
            text-wrap: balance;
          }
          button {
            min-height: 44px; padding: 8px 16px; border: 1px solid var(--grid); border-radius: 0;
            color: var(--paper); background: var(--ink); font: inherit; font-weight: 500;
            cursor: pointer;
          }
          button:is(:hover, :focus-visible) { text-decoration: underline; text-underline-offset: .28em; }
          button:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
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
