import type { ReactNode } from 'react'
import { Disclosure } from '@/components/motion'

type SettingsSectionProps = {
  title: string
  lead?: ReactNode
  children: ReactNode
  danger?: boolean
}

export function SettingsSection({ title, lead, children, danger }: SettingsSectionProps) {
  return (
    <section className="wg-settings-fold" data-danger={danger}>
      <Disclosure title={title} className="wg-settings-section" defaultOpen>
        {lead && <div className="wg-settings-lead">{lead}</div>}
        <div className="wg-settings-body">{children}</div>
      </Disclosure>
    </section>
  )
}
