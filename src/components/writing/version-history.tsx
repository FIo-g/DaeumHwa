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
  const [selectedId, setSelectedId] = useState<string | null>(first?.id ?? null)
  const selected = versions.find((v) => v.id === selectedId) ?? null

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="md:w-72 md:shrink-0">
        <VersionList
          versions={versions}
          currentVersion={currentVersion}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
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
        />
      ) : (
        <p className="text-sm text-muted-foreground">비교할 버전을 고르세요.</p>
      )}
    </div>
  )
}
