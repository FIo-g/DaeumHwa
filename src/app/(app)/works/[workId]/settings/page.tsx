import { getTodayUsage } from '@/ai/run'
import { ExportButton } from '@/components/history/export-button'
import { TRIAL_SIGNUP_MESSAGE } from '@/lib/trial'
import { DangerZone } from '@/components/settings/danger-zone'
import { type InviteView, InvitesPanel } from '@/components/settings/invites-panel'
import { MembersPanel } from '@/components/settings/members-panel'
import { SettingsSection } from '@/components/settings/settings-section'
import { type WorkSettingsValues, WorkSettingsForm } from '@/components/settings/work-settings-form'
import { PageHeader } from '@/components/app/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { resolveWorkSettings } from '@/db/types'
import { guardPage, pageContext } from '@/server/page-helpers'
import { listInvites, listMembers } from '@/server/members'
import { getWork } from '@/server/works'

// Work settings (F16). Everyone who can see the work sees the values; only the owner edits them,
// manages members and invites, and archives the work.
export default async function WorkSettingsPage({
  params,
}: {
  params: Promise<{ workId: string }>
}) {
  const { workId } = await params
  const { db, actor, user } = await pageContext(`/works/${workId}/settings`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const members = await guardPage(() => listMembers(db, actor, workId))
  const isOwner = work.role === 'owner'
  const invites = isOwner ? await guardPage(() => listInvites(db, actor, workId)) : []
  const settings = resolveWorkSettings(work.settings)
  const usage = user.isAnonymous ? null : await getTodayUsage(db, actor.userId)

  const initial: WorkSettingsValues = {
    title: work.title,
    genre: work.genre,
    logline: work.logline,
    synopsis: work.synopsis,
    absenceThreshold: settings.absenceThreshold,
    targetChars: settings.targetChars,
  }

  const inviteViews: InviteView[] = invites.map((invite) => ({
    id: invite.id,
    role: invite.role,
    token: invite.token,
    expiresAt: invite.expiresAt.toISOString(),
  }))

  return (
    <div className="wg-settings-page flex flex-col">
      <PageHeader title="작품 설정" description={work.title} />
      <Tabs defaultValue="work">
        <TabsList variant="line">
          <TabsTrigger value="work">작품</TabsTrigger>
          <TabsTrigger value="team">팀</TabsTrigger>
        </TabsList>
        <TabsContent value="work" className="wg-settings-panel">
          <WorkSettingsForm workId={workId} canEdit={isOwner} initial={initial} />
          <SettingsSection title="AI 사용량">
            {usage === null ? (
              <p className="wg-settings-write">{TRIAL_SIGNUP_MESSAGE}</p>
            ) : (
              <dl className="wg-settings-write flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <dt>오늘 내 사용량</dt>
                <dd className="font-mono tabular-nums">{usage.toLocaleString('ko-KR')} 토큰</dd>
              </dl>
            )}
          </SettingsSection>
          {(isOwner || user.isAnonymous) && (
            <SettingsSection
              title="작품 백업"
              lead={isOwner && <p>원고와 작품 설정을 zip 파일로 받아요.</p>}
            >
              {isOwner ? (
                <div className="b-row wg-settings-row">
                  <ExportButton workId={workId} title={work.title} />
                </div>
              ) : (
                <p className="wg-settings-write">{TRIAL_SIGNUP_MESSAGE}</p>
              )}
            </SettingsSection>
          )}
          {isOwner && <DangerZone workId={workId} archived={work.status === 'archived'} />}
        </TabsContent>
        <TabsContent value="team" className="wg-settings-panel">
          <MembersPanel
            workId={workId}
            viewerRole={work.role}
            currentUserId={actor.userId}
            trial={user.isAnonymous}
            members={members.map((m) => ({
              userId: m.userId,
              name: m.name,
              email: user.isAnonymous ? '' : m.email,
              role: m.role,
            }))}
          />
          {(isOwner || user.isAnonymous) &&
            (isOwner ? (
              <InvitesPanel workId={workId} invites={inviteViews} />
            ) : (
              <SettingsSection title="초대 링크">
                <p className="wg-settings-write">{TRIAL_SIGNUP_MESSAGE}</p>
              </SettingsSection>
            ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
