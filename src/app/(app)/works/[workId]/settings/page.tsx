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
  const { db, actor } = await pageContext(`/works/${workId}/settings`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const members = await guardPage(() => listMembers(db, actor, workId))
  const isOwner = work.role === 'owner'
  const invites = isOwner ? await guardPage(() => listInvites(db, actor, workId)) : []
  const settings = resolveWorkSettings(work.settings)

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
      <PageHeader title="작품 설정" description={work.title} />
      <Tabs defaultValue="work">
        <TabsList>
          <TabsTrigger value="work">작품</TabsTrigger>
          <TabsTrigger value="team">팀</TabsTrigger>
        </TabsList>
        <TabsContent value="work" className="flex flex-col gap-8 pt-4">
          <WorkSettingsForm workId={workId} canEdit={isOwner} initial={initial} />
          {isOwner && <DangerZone workId={workId} archived={work.status === 'archived'} />}
        </TabsContent>
        <TabsContent value="team" className="flex flex-col gap-8 pt-4">
          <MembersPanel
            workId={workId}
            viewerRole={work.role}
            currentUserId={actor.userId}
            members={members.map((m) => ({
              userId: m.userId,
              name: m.name,
              email: m.email,
              role: m.role,
            }))}
          />
          {isOwner && <InvitesPanel workId={workId} invites={inviteViews} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}
