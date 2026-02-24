import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import GameFlowInfographic from './GameFlowInfographic'

type TopNavProps = {
  currentPhase?: string | null
}

const links = [
  { to: '/', label: 'Home' },
  { to: '/rules', label: 'Rules' },
  { to: '/join', label: 'Join' }
]

export default function TopNav({ currentPhase = null }: TopNavProps) {
  const location = useLocation()
  const [showGameFlow, setShowGameFlow] = useState(false)
  const isPhaseRoute =
    location.pathname.startsWith('/lobby') ||
    location.pathname.startsWith('/deal') ||
    location.pathname.startsWith('/pitch') ||
    location.pathname.startsWith('/reveal') ||
    location.pathname.startsWith('/vote') ||
    location.pathname.startsWith('/results') ||
    location.pathname.startsWith('/final-round')
  const hideNav =
    location.pathname.startsWith('/lobby') ||
    location.pathname.startsWith('/deal') ||
    location.pathname.startsWith('/pitch') ||
    location.pathname.startsWith('/reveal') ||
    location.pathname.startsWith('/vote') ||
    location.pathname.startsWith('/results') ||
    location.pathname.startsWith('/final-round')
  const routePhase =
    location.pathname.startsWith('/deal')
      ? 'deal'
      : location.pathname.startsWith('/pitch')
        ? 'pitch'
        : location.pathname.startsWith('/reveal')
          ? 'reveal'
          : location.pathname.startsWith('/vote')
            ? 'vote'
            : location.pathname.startsWith('/results')
              ? 'results'
              : location.pathname.startsWith('/final-round')
                ? 'final-round'
                : null
  const phaseForHighlight = (currentPhase ?? routePhase) as
    | 'deal'
    | 'pitch'
    | 'reveal'
    | 'vote'
    | 'results'
    | 'final-round'
    | null

  return (
    <>
      <header className="top-nav">
        <div className="brand">
          <div className="brand-mark">
            <img src="/logo.svg" alt="Pitch Penguin logo" className="brand-logo" />
          </div>
          <div className="brand-text">
            <h2>Pitch Penguin</h2>
            <span>Stay Cool. Pitch Hot. Win big with the wildest ideas.</span>
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
        {isPhaseRoute && (
          <div className="nav-links">
            <button className="button secondary" onClick={() => setShowGameFlow(true)}>
              Game Flow
            </button>
          </div>
        )}
      </header>
      {showGameFlow && (
        <div className="modal-backdrop" onClick={() => setShowGameFlow(false)}>
          <div
            className="modal"
            style={{ width: 'min(980px, 96vw)', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <h3 style={{ margin: 0 }}>Game Flow</h3>
              <button className="button secondary" onClick={() => setShowGameFlow(false)}>
                Close
              </button>
            </div>
            <GameFlowInfographic currentPhase={phaseForHighlight} />
          </div>
        </div>
      )}
    </>
  )
}
