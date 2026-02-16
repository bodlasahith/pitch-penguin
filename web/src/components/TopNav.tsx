import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/lobby', label: 'Lobby' },
  { to: '/deal', label: 'Deal' },
  { to: '/pitch', label: 'Pitch' },
  { to: '/reveal', label: 'Reveal' },
  { to: '/vote', label: 'Vote' },
  { to: '/results', label: 'Results' }
]

export default function TopNav() {
  return (
    <header className="top-nav">
      <div className="brand">
        <div className="brand-mark">BW</div>
        <div className="brand-text">
          <h2>Business Walrus</h2>
          <span>Pitch night wireframes</span>
        </div>
      </div>
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
    </header>
  )
}
