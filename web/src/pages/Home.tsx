import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
      localStorage.setItem(`bw:player:${data.room.code}`, trimmedName)
      localStorage.setItem('bw:lastRoom', data.room.code)
      localStorage.setItem('bw:lastName', trimmedName)
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
            Business Walrus is a social pitch party where ASK cards spark the
            chaos, MUST HAVEs keep it grounded, and the Walrus Surprise throws a
            curveball.
          </p>
        </div>
        <div className="panel">
          <div
            className="pill"
            data-state={status === 'live' ? 'live' : status === 'down' ? 'down' : 'idle'}
          >
            {status === 'live' && 'API Connected'}
            {status === 'down' && 'API Offline'}
            {status === 'idle' && 'Checking API'}
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
          <h3>Robot reader</h3>
          <p>
            Every pitch gets an AI voice. Choose from quirky announcers and
            crisp startup narrators.
          </p>
        </div>
        <div className="panel">
          <h3>Visual pitch board</h3>
          <p>
            Add a doodle or logo sketch while you pitch. Keep it simple and
            chaotic.
          </p>
        </div>
      </section>

      <section className="panel">
        <h3>Rulebook highlights</h3>
        <ul className="list">
          {(rules.length > 0
            ? rules
            : [
                'Walrus rotates each round and reads the ASK aloud.',
                'Each player draws 4 MUST HAVEs and uses at least 1.',
                'A secret Walrus Surprise hits one random player.',
                'Walrus Surprise winners score 2 points instead of 1.',
                'Players can request an AI pitch, but it is challengeable.',
                'First to 5 points ends the game.'
              ]
          ).map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>Round flow</h3>
        <div className="grid">
          <div className="card">
            <strong>1. Deal cards</strong>
            <span>ASK + MUST HAVEs + Walrus Surprise.</span>
          </div>
          <div className="card">
            <strong>2. Write pitch</strong>
            <span>Timer + voice selection + optional sketch.</span>
          </div>
          <div className="card">
            <strong>3. Reveal</strong>
            <span>Robot readers take turns presenting.</span>
          </div>
          <div className="card">
            <strong>4. Vote</strong>
            <span>Walrus crowns the winner of the round.</span>
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h3>Win condition</h3>
          <p>
            Each round, the Walrus selects the best pitch. That player gains 1
            point, or 2 points if they held the Walrus Surprise. First to 5
            points wins and the game ends.
          </p>
        </div>
        <div className="panel">
          <h3>AI pitch challenge (later)</h3>
          <p>
            If a player runs out of time, they can request a quick AI-generated
            pitch. Anyone can challenge a suspicious pitch during reveal.
          </p>
        </div>
      </section>
    </>
  )
}
