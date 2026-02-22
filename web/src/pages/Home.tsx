import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { playActionSound } from '../utils/soundEffects'

type HealthStatus = {
  ok: boolean
  service: string
  time: string
}

type RulesResponse = {
  ok: boolean
  rules: string[]
}

type CreateRoomResponse = {
  ok: boolean
  room?: {
    code: string
  }
  message?: string
}

export default function Home() {
  const navigate = useNavigate()
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [status, setStatus] = useState<'idle' | 'live' | 'down'>('idle')
  const [rules, setRules] = useState<string[]>([])
  const [roomStatus, setRoomStatus] = useState<'idle' | 'loading' | 'error'>(
    'idle'
  )
  const [hostName, setHostName] = useState('')
  const [roomError, setRoomError] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [healthResponse, rulesResponse] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/rules')
        ])
        if (!healthResponse.ok) {
          throw new Error('Health check failed')
        }
        const data = (await healthResponse.json()) as HealthStatus
        const rulesData = rulesResponse.ok
          ? ((await rulesResponse.json()) as RulesResponse)
          : null
        if (!cancelled) {
          setHealth(data)
          setStatus('live')
          setRules(rulesData?.rules ?? [])
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('down')
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleCreateRoom = async () => {
    try {
      const trimmedName = hostName.trim()
      if (!trimmedName) {
        setRoomError('Enter a host name to continue.')
        return
      }
      setRoomStatus('loading')
      setRoomError('')
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: trimmedName })
      })
      const data = (await response.json()) as CreateRoomResponse
      if (!data.ok || !data.room) {
        setRoomStatus('error')
        setRoomError(data.message ?? 'Could not create a room.')
        return
      }
      localStorage.setItem(`pp:player:${data.room.code}`, trimmedName)
      localStorage.setItem('pp:lastRoom', data.room.code)
      localStorage.setItem('pp:lastName', trimmedName)
      playActionSound('join_lobby')
      navigate(`/lobby/${data.room.code}`)
    } catch (err) {
      setRoomStatus('error')
      setRoomError('Could not create a room.')
    }
  }

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Kickoff</div>
          <h1>Bring the pitch night online.</h1>
          <p>
            Pitch Penguin is a entrepreneurship-themed social pitch party
            where: <br></br> <strong>PROBLEM</strong> cards present a problem, <br></br> <strong>CONSTRAINTS</strong> are quirky requirements, <br></br> and <strong>TWISTs</strong> throw a curveball.
            <br></br>Penguins may invest in ideas based on creativity, effort,
            entertainment, or just pure chaos.
          </p>
        </div>
        <div className="panel">
          <div
            className="pill"
            data-state={status === 'live' ? 'live' : status === 'down' ? 'down' : 'idle'}
          >
            {status === 'live' && 'Backend Online'}
            {status === 'down' && 'Backend Offline'}
            {status === 'idle' && 'Checking Backend...'}
          </div>
          <p style={{ marginTop: '10px' }}>
            {health?.service ?? 'Waiting for backend...'}
          </p>
          <p style={{ marginTop: '6px', fontSize: '0.85rem' }}>
            {health?.time ?? 'No timestamp yet'}
          </p>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h3>Start a room</h3>
          <p>Create a lobby, invite friends, choose local or online play.</p>
          <label htmlFor="host-name" style={{ marginTop: '12px', display: 'block' }}>
            <strong>Host name</strong>
          </label>
          <input
            id="host-name"
            className="input"
            placeholder="Your name"
            value={hostName}
            onChange={(event) => setHostName(event.target.value)}
            style={{ marginTop: '10px' }}
          />
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <button
              className="button"
              onClick={handleCreateRoom}
              disabled={roomStatus === 'loading'}
            >
              Create room
            </button>
            <button
              className="button secondary"
              onClick={() => navigate('/join')}
            >
              Join room
            </button>
          </div>
          {(roomStatus === 'error' || roomError) && (
            <p style={{ marginTop: '12px', color: '#8c2d2a' }}>
              {roomError || 'Could not create a room. Try again.'}
            </p>
          )}
        </div>
        <div className="panel">
          <h3>Visual pitch board</h3>
          <p>
            Add a doodle or logo sketch while you pitch, Pictionary-style. Make sure to
            <span title="Keep it simple, stupid."> KiSS!</span>
          </p>
          <h3 style={{ marginTop: '24px' }}>Robot reader</h3>
          <p>
            Every pitch gets an robot voice. Choose from quirky announcers and
            crisp startup narrators, if you don't want to do the honors yourself.
          </p>
          <h3 style={{ marginTop: '24px' }}>The AI angle</h3>
          <p>
            If you can't come up with a pitch in time, the AI Assistant has your back.
            But beware - if your opponents correctly guess that your pitch was AI-generated,
            you could be disqualified and lose money. Use it wisely!
          </p>
        </div>
      </section>
      <section className="panel">
        <h3>Rules of the game</h3>
        <div className="grid">
          <ul className="list">
            {(rules.length > 0
              ? rules.slice(0, Math.ceil(rules.length / 2))
              : ['Loading rules...']
            ).map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <ul className="list">
            {(rules.length > 0
              ? rules.slice(Math.ceil(rules.length / 2))
              : []
            ).map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <h3>Round flow</h3>
        <div className="grid">
          <div className="card">
            <strong>1. Deal cards</strong>
            <span>PROBLEM + CONSTRAINTS + TWIST.</span>
          </div>
          <div className="card">
            <strong>2. Write pitch</strong>
            <span>Timer + pitch + description + optional sketch.</span>
          </div>
          <div className="card">
            <strong>3. Reveal</strong>
            <span>Players take turns presenting to the Penguin.</span>
          </div>
          <div className="card">
            <strong>4. Vote</strong>
            <span>Penguin crowns the winner of the round and invests in them.</span>
          </div>
        </div>
        <h3 style={{ marginTop: '24px' }}>Final round Case A: Top player pitch-off</h3>
        <div className="grid">
          <div className="card">
            <strong>1. Write pitch</strong>
            <span>
              Auto assigned PROBLEM + CONSTRAINTS. Top 2-7 players pitch head-to-head.
            </span>
          </div>
          <div className="card">
            <strong>2. Vote</strong>
            <span>
              Penguin(es) rank the pitches best to worst. Player with the most money wins.
            </span>
          </div>
        </div>
        <h3 style={{ marginTop: '24px' }}>Final round Case B: Top player immunity</h3>
        <div className="grid">
          <div className="card">
            <strong>1. Write pitch</strong>
            <span>
              Auto assigned PROBLEM + CONSTRAINTS. Top player gets immunity bonus and becomes
              Penguin. Everyone else pitches to compete for ranks 2-7.
            </span>
          </div>
          <div className="card">
            <strong>2. Vote</strong>
            <span>
              Penguin ranks the pitches best to worst. Players may rise or fall,
              but the penguin stays safe on top.
            </span>
          </div>
        </div>
      </section>
    </>
  )
}
