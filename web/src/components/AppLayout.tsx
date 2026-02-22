import type { ReactNode } from 'react'
import { apiFetch } from '../utils/api'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import TopNav from './TopNav'
import { getSocket } from '../utils/socket'

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
  const lastReadyPhaseRef = useRef<string | null>(null)
  const transitionPhaseRef = useRef<string | null>(null)
  const transitionEndsAtRef = useRef<number | null>(null)

  useEffect(() => {
    lastPathRef.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    const roomFromPath = location.pathname.startsWith('/lobby/')
      ? location.pathname.split('/')[2] ?? ''
      : ''
    const storedRoom = localStorage.getItem('pp:lastRoom') ?? ''
    setRoomCode(roomFromPath || storedRoom)
  }, [location.pathname])

  useEffect(() => {
    if (!roomCode) {
      return
    }

    const socket = getSocket()
    const playerName = localStorage.getItem(`pp:player:${roomCode}`) ?? ''
    const handleRoomState = (payload: { code?: string; status?: string; room?: { phase?: string } }) => {
      if (payload.code && payload.code !== roomCode) {
        return
      }
      const nextPhase = payload.room?.phase ?? payload.status
      if (nextPhase) {
        setRoomPhase(nextPhase)
      }
    }

    if (!socket.connected) {
      socket.connect()
    }
    socket.on('room:state', handleRoomState)
    socket.emit('room:join', { code: roomCode, playerName })

    return () => {
      socket.emit('room:leave', { code: roomCode })
      socket.off('room:state', handleRoomState)
    }
  }, [roomCode])

  useEffect(() => {
    if (!roomCode) {
      setRoomPhase(null)
      return
    }
    let intervalId: number | undefined

    const loadPhase = async () => {
      const response = await apiFetch(`/api/room/${roomCode}/game`)
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
    if (roomPhase === 'final-round') return '/final-round'
    return null
  }, [roomCode, roomPhase])

  useEffect(() => {
    if (roomPhase !== 'deal' && roomPhase !== 'pitch' && roomPhase !== 'final-round') {
      lastReadyPhaseRef.current = null
    }
  }, [roomPhase])

  useEffect(() => {
    if (!roomCode || !roomPhase || isPublicRoute || !phasePath) {
      if (isTransitioning) {
        setIsTransitioning(false)
      }
      return
    }

    const transitionKey = `${roomPhase}:${phasePath}`

    if (roomPhase === 'lobby') {
      if (isTransitioning) {
        setIsTransitioning(false)
      }
      return
    }

    if (transitionPhaseRef.current !== transitionKey) {
      transitionPhaseRef.current = transitionKey
      transitionEndsAtRef.current = Date.now() + 3000
      setIsTransitioning(true)
    }

    if (location.pathname !== phasePath) {
      navigate(phasePath, { replace: true })
      return
    }

    if (isTransitioning) {
      const endsAt = transitionEndsAtRef.current ?? Date.now()
      const remaining = Math.max(0, endsAt - Date.now())
      const timeoutId = window.setTimeout(() => {
        setIsTransitioning(false)
      }, remaining)
      return () => window.clearTimeout(timeoutId)
    }
  }, [roomCode, roomPhase, phasePath, location.pathname, isPublicRoute, navigate, isTransitioning])

  useEffect(() => {
    const signalReady = async () => {
      if (!roomCode || !roomPhase || isPublicRoute || isTransitioning) {
        return
      }
      if (roomPhase !== 'deal' && roomPhase !== 'pitch' && roomPhase !== 'final-round') {
        return
      }
      if (location.pathname !== phasePath) {
        return
      }
      if (lastReadyPhaseRef.current === roomPhase) {
        return
      }
      const playerName = localStorage.getItem(`pp:player:${roomCode}`) ?? ''
      if (!playerName) {
        return
      }

      try {
        const response = await apiFetch(`/api/room/${roomCode}/player-ready`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerName })
        })
        if (response.ok) {
          lastReadyPhaseRef.current = roomPhase
        }
      } catch (err) {
        console.error('Error signaling player ready:', err)
      }
    }

    void signalReady()
  }, [roomCode, roomPhase, phasePath, location.pathname, isPublicRoute, isTransitioning])

  const phaseCopy = useMemo(() => {
    switch (roomPhase) {
      case 'deal':
        return { title: 'Up next: The Deal', subtitle: 'Shuffling PROBLEM cards and TWIST cards.' }
      case 'pitch':
        return { title: 'Up next: Pitch Lab', subtitle: 'Deal locked. Time to build your pitch.' }
      case 'reveal':
        return { title: 'Up next: Reveal', subtitle: 'Queueing pitches for the penguin.' }
      case 'results':
        return { title: 'Up next: Results', subtitle: 'Counting $100 bills and the winner.' }
      case 'final-round':
        return { title: 'Up next: Final Round', subtitle: 'Loading championship pitches.' }
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
    const playerName = localStorage.getItem(`pp:player:${roomCode}`) ?? ''
    try {
      setLeaving(true)
      if (playerName) {
        await apiFetch('/api/rooms/leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: roomCode, playerName })
        })
      }
    } finally {
      localStorage.removeItem(`pp:player:${roomCode}`)
      if (localStorage.getItem('pp:lastRoom') === roomCode) {
        localStorage.removeItem('pp:lastRoom')
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
            <img
              src="/logo-mono.svg"
              alt=""
              aria-hidden="true"
              className="phase-logo-bg"
              style={{ width: '100px', height: '100px' }}
            />
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
