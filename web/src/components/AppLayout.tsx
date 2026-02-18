import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import TopNav from './TopNav'

type AppLayoutProps = {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [roomPhase, setRoomPhase] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [showLeavePrompt, setShowLeavePrompt] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const lastPathRef = useRef(location.pathname)

  useEffect(() => {
    lastPathRef.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    const roomFromPath = location.pathname.startsWith('/lobby/')
      ? location.pathname.split('/')[2] ?? ''
      : ''
    const storedRoom = localStorage.getItem('bw:lastRoom') ?? ''
    setRoomCode(roomFromPath || storedRoom)
  }, [location.pathname])

  useEffect(() => {
    if (!roomCode) {
      setRoomPhase(null)
      return
    }
    let intervalId: number | undefined

    const loadPhase = async () => {
      const response = await fetch(`/api/room/${roomCode}/game`)
      if (!response.ok) {
        return
      }
      const data = (await response.json()) as { ok: boolean; room?: { phase?: string } }
      if (data.ok && data.room?.phase) {
        setRoomPhase(data.room.phase)
      }
    }

    void loadPhase()
    intervalId = window.setInterval(loadPhase, 2000)

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId)
      }
    }
  }, [roomCode])

  const isPublicRoute = useMemo(() => {
    return location.pathname === '/' || location.pathname.startsWith('/join')
  }, [location.pathname])

  const phasePath = useMemo(() => {
    if (!roomCode || !roomPhase) {
      return null
    }
    if (roomPhase === 'lobby') {
      return `/lobby/${roomCode}`
    }
    if (roomPhase === 'deal') return '/deal'
    if (roomPhase === 'pitch') return '/pitch'
    if (roomPhase === 'reveal') return '/reveal'
    if (roomPhase === 'vote') return '/vote'
    if (roomPhase === 'results') return '/results'
    return null
  }, [roomCode, roomPhase])

  useEffect(() => {
    if (!roomCode || !roomPhase || isPublicRoute || !phasePath) {
      return
    }
    if (roomPhase === 'lobby') {
      if (isTransitioning) {
        setIsTransitioning(false)
      }
      return
    }
    if (location.pathname !== phasePath) {
      setIsTransitioning(true)
      navigate(phasePath, { replace: true })
      return
    }
    if (isTransitioning) {
      const timeoutId = window.setTimeout(() => setIsTransitioning(false), 600)
      return () => window.clearTimeout(timeoutId)
    }
  }, [roomCode, roomPhase, phasePath, location.pathname, isPublicRoute, navigate])

  const phaseCopy = useMemo(() => {
    switch (roomPhase) {
      case 'deal':
        return { title: 'Up next: The Deal', subtitle: 'Shuffling ASK cards and surprises.' }
      case 'pitch':
        return { title: 'Up next: Pitch Lab', subtitle: 'Deal locked. Time to build your pitch.' }
      case 'reveal':
        return { title: 'Up next: Reveal', subtitle: 'Queueing pitches for the walrus.' }
      case 'results':
        return { title: 'Up next: Results', subtitle: 'Counting $100 bills and the winner.' }
      default:
        return { title: 'Syncing round', subtitle: 'Gathering the latest room state.' }
    }
  }, [roomPhase])

  const isActiveGame = Boolean(roomCode && roomPhase && roomPhase !== 'lobby')

  useEffect(() => {
    if (!isActiveGame) {
      return
    }
    const handlePopState = (event: PopStateEvent) => {
      event.preventDefault()
      setShowLeavePrompt(true)
      navigate(lastPathRef.current, { replace: true })
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isActiveGame, navigate])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isActiveGame) {
        return
      }
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isActiveGame])

  const handleConfirmLeave = async () => {
    if (!roomCode) {
      navigate('/')
      return
    }
    const playerName = localStorage.getItem(`bw:player:${roomCode}`) ?? ''
    try {
      setLeaving(true)
      if (playerName) {
        await fetch('/api/rooms/leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: roomCode, playerName })
        })
      }
    } finally {
      localStorage.removeItem(`bw:player:${roomCode}`)
      if (localStorage.getItem('bw:lastRoom') === roomCode) {
        localStorage.removeItem('bw:lastRoom')
      }
      setLeaving(false)
      setShowLeavePrompt(false)
      navigate('/')
    }
  }

  return (
    <div className="app-shell">
      <TopNav />
      <main className="page">{children}</main>
      {isTransitioning && !isPublicRoute && roomPhase !== 'lobby' && (
        <div className="phase-loading">
          <div className="phase-card">
            <div className="phase-orb" />
            <div className="phase-spark" />
            <div className="phase-lines">
              <span />
              <span />
              <span />
            </div>
            <div className="phase-text">
              <div className="eyebrow">Next Phase</div>
              <h2>{phaseCopy.title}</h2>
              <p>{phaseCopy.subtitle}</p>
            </div>
          </div>
        </div>
      )}
      {showLeavePrompt && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Leave the game?</h3>
            <p>
              You will be removed from the room and lose your place in the round.
            </p>
            <div className="footer-actions" style={{ marginTop: '16px' }}>
              <button className="button" onClick={handleConfirmLeave} disabled={leaving}>
                {leaving ? 'Leaving...' : 'Leave Game'}
              </button>
              <button
                className="button secondary"
                onClick={() => setShowLeavePrompt(false)}
                disabled={leaving}
              >
                Stay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
