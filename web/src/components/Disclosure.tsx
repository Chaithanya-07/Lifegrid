import { useId, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/**
 * A collapsible section with a proper button header (aria-expanded / aria-controls). Content stays mounted while
 * collapsed (only hidden) so inner state, such as a half-typed new tag, is never lost.
 */
export function Disclosure({
  title, icon, summary, defaultOpen = false, children,
}: { title: string; icon?: IconName; summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className={`disclosure${open ? ' open' : ''}`}>
      <button type="button" className="disclosure-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {icon && <span className="disclosure-icon" aria-hidden="true"><Icon name={icon} /></span>}
        <span className="disclosure-title">{title}</span>
        {summary && <span className="disclosure-summary">{summary}</span>}
        <Icon name="chevronDown" className="icon-svg disclosure-chevron" />
      </button>
      <div id={id} className="disclosure-body" hidden={!open}>{children}</div>
    </section>
  )
}
