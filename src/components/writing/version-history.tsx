'use client'

import { useState } from 'react'
import { VersionDiff } from './version-diff'
import { type VersionListEntry, VersionList } from './version-list'

type VersionHistoryProps = {
  workId: string
  chapterId: string
  currentVersion: number
  currentBody: string
  versions: VersionListEntry[]
  canRestore: boolean
}

/** Version list on the left, the selected version compared with the current text on the right. */
export function VersionHistory({
  workId,
  chapterId,
  currentVersion,
  currentBody,
  versions,
  canRestore,
}: VersionHistoryProps) {
  // Start on the newest version that is not the current one, since that is the usual reason to look.
  const first = versions.find((v) => v.version !== currentVersion) ?? versions[0]
  const [selection, setSelection] = useState({ id: first?.id ?? null, replay: false })
  const selected = versions.find((v) => v.id === selection.id) ?? null

  return (
    <div className="wg-chapters-history">
      <div className="min-w-0">
        <VersionList
          versions={versions}
          currentVersion={currentVersion}
          selectedId={selected?.id ?? null}
          onSelect={(id) => {
            if (id !== selection.id) setSelection({ id, replay: true })
          }}
        />
      </div>
      {selected ? (
        <VersionDiff
          key={selected.id}
          workId={workId}
          chapterId={chapterId}
          versionId={selected.id}
          versionNumber={selected.version}
          currentBody={currentBody}
          currentVersion={currentVersion}
          canRestore={canRestore}
          replay={selection.replay}
        />
      ) : (
        <p className="text-sm text-muted-foreground">비교할 버전을 고르세요.</p>
      )}
    </div>
  )
}
