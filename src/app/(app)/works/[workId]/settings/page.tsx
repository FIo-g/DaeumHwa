import '@/app/styles/b-tools.css'
import { SlidersHorizontalIcon } from 'lucide-react'
import { getTodayUsage } from '@/ai/run'
import { ExportButton } from '@/components/history/export-button'
import { Disclosure } from '@/components/motion'
import { TRIAL_SIGNUP_MESSAGE } from '@/lib/trial'
import { DangerZone } from '@/components/settings/danger-zone'
import { type InviteView, InvitesPanel } from '@/components/settings/invites-panel'
import { MembersPanel } from '@/components/settings/members-panel'
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
    <div className="flex flex-col">
      <PageHeader
        title="작품 설정"
        band="mustard"
        description={work.title}
        actions={
          <span className="b-tools-header-art" data-tool="settings" aria-hidden="true">
            <i />
            <i />
            <span>
              <SlidersHorizontalIcon />
            </span>
          </span>
        }
      />
      <Tabs defaultValue="work">
        <TabsList variant="line">
          <TabsTrigger value="work">작품</TabsTrigger>
          <TabsTrigger value="team">팀</TabsTrigger>
        </TabsList>
        <TabsContent value="work" className="b-tools-settings-panel">
          <Disclosure title="작품 정보" className="b-tools-disclosure" defaultOpen>
            <div className="b-tools-disclosure-body">
              <WorkSettingsForm workId={workId} canEdit={isOwner} initial={initial} />
            </div>
          </Disclosure>
          <Disclosure title="AI 사용량" className="b-tools-disclosure" defaultOpen>
            <div className="b-tools-disclosure-body">
              {usage === null ? (
                <p>{TRIAL_SIGNUP_MESSAGE}</p>
              ) : (
                <dl className="flex flex-wrap items-baseline gap-2">
                  <dt>오늘 내 사용량</dt>
                  <dd className="b-subhead tabular-nums">{usage.toLocaleString('ko-KR')} 토큰</dd>
                </dl>
              )}
            </div>
          </Disclosure>
          {(isOwner || user.isAnonymous) && (
            <Disclosure title="작품 백업" className="b-tools-disclosure" defaultOpen>
              <div className="b-tools-disclosure-body grid gap-2">
                {isOwner ? (
                  <>
                    <p className="text-muted-ink">원고와 작품 설정을 zip 파일로 받아요.</p>
                    <ExportButton workId={workId} title={work.title} />
                  </>
                ) : (
                  <p>{TRIAL_SIGNUP_MESSAGE}</p>
                )}
              </div>
            </Disclosure>
          )}
          {isOwner && (
            <Disclosure title="보관 관리" className="b-tools-disclosure" defaultOpen>
              <div className="b-tools-disclosure-body">
                <DangerZone workId={workId} archived={work.status === 'archived'} />
              </div>
            </Disclosure>
          )}
        </TabsContent>
        <TabsContent value="team" className="b-tools-settings-panel">
          <Disclosure title="팀 관리" className="b-tools-disclosure" defaultOpen>
            <div className="b-tools-disclosure-body">
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
            </div>
          </Disclosure>
          {(isOwner || user.isAnonymous) && (
            <Disclosure title="초대 링크" className="b-tools-disclosure" defaultOpen>
              <div className="b-tools-disclosure-body">
                {isOwner ? (
                  <InvitesPanel workId={workId} invites={inviteViews} />
                ) : (
                  <p>{TRIAL_SIGNUP_MESSAGE}</p>
                )}
              </div>
            </Disclosure>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
