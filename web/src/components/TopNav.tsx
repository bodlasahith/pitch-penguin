import { NavLink, useLocation } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/rules', label: 'Rules' },
  { to: '/join', label: 'Join' }
]

export default function TopNav() {
  const location = useLocation()
  const hideNav =
    location.pathname.startsWith('/lobby') ||
    location.pathname.startsWith('/deal') ||
    location.pathname.startsWith('/pitch') ||
    location.pathname.startsWith('/reveal') ||
    location.pathname.startsWith('/vote') ||
    location.pathname.startsWith('/results')

  return (
    <header className="top-nav">
      <div className="brand">
        <div className="brand-mark">
          <img src="/logo.svg" alt="Pitch Penguin logo" className="brand-logo" />
        </div>
        <div className="brand-text">
          <h2>Pitch Penguin</h2>
          <span>Pitch night wireframes</span>
        </div>
      </div>
      {!hideNav && (
        <nav className="nav-links">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}
