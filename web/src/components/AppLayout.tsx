import type { ReactNode } from 'react'
import TopNav from './TopNav'

type AppLayoutProps = {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <TopNav />
      <main className="page">{children}</main>
    </div>
  )
}
